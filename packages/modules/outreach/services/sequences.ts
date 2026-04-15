/**
 * Sequences runner.
 *
 * Processes active enrollments whose next_send_at is due:
 *   1. Looks up the current step's template (or uses AI draft)
 *   2. Renders merge fields with lead data
 *   3. Sends via Resend (emailer service)
 *   4. Advances current_step + schedules next step by delay_days
 *   5. Marks completed when all steps sent
 *
 * Triggered by /api/cron/sequences (Vercel Cron, hourly).
 */

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@recon/db/client";
import { leads } from "../schema/leads";
import { outreachEmails } from "../schema/emails";
import { sequences, sequenceSteps } from "../schema/sequences";
import { sequenceEnrollments } from "../schema/sequence-enrollments";
import { emailTemplates } from "../schema/templates";
import { sendEmail } from "./emailer";
import { draftEmail } from "./email-drafter";
import { reviewAnalyses } from "../schema/reviews";
import { desc } from "drizzle-orm";

const MAX_PER_RUN = 50;

interface RunResult {
  processed: number;
  sent: number;
  completed: number;
  errors: number;
  details: Array<{ enrollmentId: string; outcome: string; error?: string }>;
}

function renderMergeFields(
  template: string,
  lead: {
    name: string | null;
    category: string | null;
    suburb: string | null;
    state: string | null;
    website: string | null;
    phone: string | null;
    rating: string | null;
  },
): string {
  const nameParts = (lead.name ?? "").split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ");
  const fields: Record<string, string> = {
    "{{business_name}}": lead.name ?? "",
    "{{first_name}}": firstName,
    "{{last_name}}": lastName,
    "{{category}}": lead.category ?? "",
    "{{suburb}}": lead.suburb ?? "",
    "{{state}}": lead.state ?? "",
    "{{website}}": lead.website ?? "",
    "{{phone}}": lead.phone ?? "",
    "{{rating}}": String(lead.rating ?? ""),
  };
  let out = template;
  for (const [k, v] of Object.entries(fields)) {
    out = out.replaceAll(k, v);
  }
  return out;
}

/**
 * Process due enrollments. Called by the cron endpoint.
 */
export async function runDueSequenceSteps(): Promise<RunResult> {
  const db = getDb();
  const now = new Date();
  const result: RunResult = {
    processed: 0,
    sent: 0,
    completed: 0,
    errors: 0,
    details: [],
  };

  // Find due active enrollments (oldest due first, cap per-run)
  const due = await db
    .select()
    .from(sequenceEnrollments)
    .where(
      and(
        eq(sequenceEnrollments.status, "active"),
        lte(sequenceEnrollments.nextSendAt, now),
      ),
    )
    .orderBy(asc(sequenceEnrollments.nextSendAt))
    .limit(MAX_PER_RUN);

  for (const enroll of due) {
    result.processed += 1;
    try {
      // 1. Load lead (skip if deleted or has no email)
      const [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, enroll.leadId))
        .limit(1);

      if (!lead || !lead.email) {
        await db
          .update(sequenceEnrollments)
          .set({
            status: "stopped_manual",
            lastError: "Lead missing or has no email",
            updatedAt: now,
          })
          .where(eq(sequenceEnrollments.id, enroll.id));
        result.details.push({
          enrollmentId: enroll.id,
          outcome: "stopped_no_email",
        });
        continue;
      }

      // 2. Short-circuit: if the lead has any replied/bounced email, stop.
      const [terminalEmail] = await db
        .select({ status: outreachEmails.status })
        .from(outreachEmails)
        .where(
          and(
            eq(outreachEmails.leadId, lead.id),
            sql`${outreachEmails.status} IN ('replied','bounced')`,
          ),
        )
        .limit(1);

      if (terminalEmail) {
        await db
          .update(sequenceEnrollments)
          .set({
            status:
              terminalEmail.status === "replied"
                ? "stopped_replied"
                : "stopped_bounced",
            updatedAt: now,
          })
          .where(eq(sequenceEnrollments.id, enroll.id));
        result.details.push({
          enrollmentId: enroll.id,
          outcome: `stopped_${terminalEmail.status}`,
        });
        continue;
      }

      // 3. Load the current step
      const [step] = await db
        .select({
          id: sequenceSteps.id,
          stepNumber: sequenceSteps.stepNumber,
          templateId: sequenceSteps.templateId,
          delayDays: sequenceSteps.delayDays,
          aiGenerate: sequenceSteps.aiGenerate,
        })
        .from(sequenceSteps)
        .where(
          and(
            eq(sequenceSteps.sequenceId, enroll.sequenceId),
            eq(sequenceSteps.stepNumber, enroll.currentStep),
          ),
        )
        .limit(1);

      if (!step) {
        // No more steps → mark completed
        await db
          .update(sequenceEnrollments)
          .set({ status: "completed", updatedAt: now })
          .where(eq(sequenceEnrollments.id, enroll.id));
        result.completed += 1;
        result.details.push({ enrollmentId: enroll.id, outcome: "completed" });
        continue;
      }

      // 4. Resolve subject + body (template or AI-draft)
      let subject = "";
      let body = "";

      if (step.aiGenerate) {
        // Use recent pain points if available
        const [analysis] = await db
          .select({ weaknesses: reviewAnalyses.weaknesses })
          .from(reviewAnalyses)
          .where(eq(reviewAnalyses.leadId, lead.id))
          .orderBy(desc(reviewAnalyses.createdAt))
          .limit(1);

        const draft = await draftEmail(
          {
            name: lead.name,
            category: lead.category ?? "",
            suburb: lead.suburb ?? "",
            state: lead.state ?? "",
            rating: String(lead.rating ?? ""),
            reviewCount: lead.reviewCount ?? 0,
            painPoints: (analysis?.weaknesses as string[]) ?? [],
            website: lead.website,
          },
          "professional outreach from Warmed Up",
        );
        subject = draft.subject;
        body = draft.body;
      } else if (step.templateId) {
        const [tpl] = await db
          .select({
            subject: emailTemplates.subject,
            body: emailTemplates.body,
          })
          .from(emailTemplates)
          .where(eq(emailTemplates.id, step.templateId))
          .limit(1);

        if (!tpl) {
          throw new Error(`Template ${step.templateId} not found`);
        }
        subject = renderMergeFields(tpl.subject, lead);
        body = renderMergeFields(tpl.body, lead);
      } else {
        throw new Error("Step has no template and aiGenerate=false");
      }

      // 5. Insert outreach_emails row + send via Resend
      const html = body.includes("<")
        ? body
        : `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">${body.replaceAll("\n", "<br>")}</div>`;

      const { messageId } = await sendEmail({
        to: lead.email,
        subject,
        html,
      });

      await db.insert(outreachEmails).values({
        leadId: lead.id,
        workspaceId: enroll.workspaceId,
        sequenceId: enroll.sequenceId,
        stepNumber: step.stepNumber,
        subject,
        body,
        toEmail: lead.email,
        status: "sent",
        sentAt: now,
        providerMessageId: messageId,
      });

      await db
        .update(leads)
        .set({
          lastContactedAt: now,
          updatedAt: now,
          status: lead.status === "new" ? "contacted" : lead.status,
        })
        .where(eq(leads.id, lead.id));

      result.sent += 1;

      // 6. Advance pointer — schedule next step or mark completed
      const nextStepNumber = enroll.currentStep + 1;
      const [nextStep] = await db
        .select({ delayDays: sequenceSteps.delayDays })
        .from(sequenceSteps)
        .where(
          and(
            eq(sequenceSteps.sequenceId, enroll.sequenceId),
            eq(sequenceSteps.stepNumber, nextStepNumber),
          ),
        )
        .limit(1);

      if (!nextStep) {
        await db
          .update(sequenceEnrollments)
          .set({
            status: "completed",
            currentStep: nextStepNumber,
            updatedAt: now,
          })
          .where(eq(sequenceEnrollments.id, enroll.id));
        result.completed += 1;
        result.details.push({ enrollmentId: enroll.id, outcome: "sent+completed" });
      } else {
        const nextSendAt = new Date(
          now.getTime() + (nextStep.delayDays ?? 0) * 86400 * 1000,
        );
        await db
          .update(sequenceEnrollments)
          .set({
            currentStep: nextStepNumber,
            nextSendAt,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(sequenceEnrollments.id, enroll.id));
        result.details.push({ enrollmentId: enroll.id, outcome: "sent" });
      }
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[sequences] Error processing enrollment", enroll.id, err);
      await db
        .update(sequenceEnrollments)
        .set({ lastError: msg, updatedAt: now })
        .where(eq(sequenceEnrollments.id, enroll.id));
      result.details.push({
        enrollmentId: enroll.id,
        outcome: "error",
        error: msg,
      });
    }
  }

  return result;
}

/**
 * Enroll a batch of leads into a sequence. Dedupes against existing active rows.
 */
export async function enrollLeadsInSequence(
  workspaceId: string,
  sequenceId: string,
  leadIds: string[],
): Promise<{ enrolled: number; skipped: number }> {
  const db = getDb();
  const now = new Date();

  // Verify sequence belongs to workspace + load first step's delay (0 by default)
  const [seq] = await db
    .select({ id: sequences.id })
    .from(sequences)
    .where(
      and(
        eq(sequences.id, sequenceId),
        eq(sequences.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!seq) throw new Error("Sequence not found in workspace");

  // Find existing active enrollments to skip
  const existing = await db
    .select({ leadId: sequenceEnrollments.leadId })
    .from(sequenceEnrollments)
    .where(
      and(
        eq(sequenceEnrollments.sequenceId, sequenceId),
        eq(sequenceEnrollments.status, "active"),
        sql`${sequenceEnrollments.leadId} = ANY(${leadIds})`,
      ),
    );
  const activeSet = new Set(existing.map((r) => r.leadId));

  const toInsert = leadIds
    .filter((id) => !activeSet.has(id))
    .map((leadId) => ({
      workspaceId,
      sequenceId,
      leadId,
      currentStep: 1,
      status: "active" as const,
      nextSendAt: now, // fire first step immediately on next cron tick
      createdAt: now,
      updatedAt: now,
    }));

  if (toInsert.length === 0) {
    return { enrolled: 0, skipped: leadIds.length };
  }

  // Upsert: if a prior completed/stopped row exists, reset it; else insert new.
  await db
    .insert(sequenceEnrollments)
    .values(toInsert)
    .onConflictDoUpdate({
      target: [sequenceEnrollments.leadId, sequenceEnrollments.sequenceId],
      set: {
        status: "active",
        currentStep: 1,
        nextSendAt: now,
        lastError: null,
        updatedAt: now,
      },
    });

  return { enrolled: toInsert.length, skipped: activeSet.size };
}
