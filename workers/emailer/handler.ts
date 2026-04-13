import type { SQSEvent, SQSHandler, SQSRecord } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import { outreachEmails } from "../../packages/modules/outreach/schema/emails";
import { leads } from "../../packages/modules/outreach/schema/leads";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailMessage {
  type: string;
  workspaceId: string;
  payload: {
    emailId: string;
    leadId: string;
  };
}

// ---------------------------------------------------------------------------
// Lazy-initialised singletons
// ---------------------------------------------------------------------------

let _db: PostgresJsDatabase | null = null;
let _ses: SESClient | null = null;

function getDb(): PostgresJsDatabase {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    _db = drizzle(postgres(url, { max: 5 }));
  }
  return _db;
}

function getSes(): SESClient {
  if (!_ses) {
    _ses = new SESClient({ region: process.env.AWS_REGION ?? "ap-southeast-2" });
  }
  return _ses;
}

// ---------------------------------------------------------------------------
// Merge field rendering
// ---------------------------------------------------------------------------

function renderTemplate(template: string, lead: Record<string, any>): string {
  const nameParts = (lead.name ?? "").split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") ?? "";

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

  let result = template;
  for (const [tag, value] of Object.entries(fields)) {
    result = result.replaceAll(tag, value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

async function processEmail(record: SQSRecord): Promise<boolean> {
  const db = getDb();
  const ses = getSes();

  // Parse SNS envelope + domain event
  const body = JSON.parse(record.body);
  const message: EmailMessage = JSON.parse(body.Message ?? JSON.stringify(body));

  const { workspaceId, payload } = message;
  const { emailId, leadId } = payload;

  console.log("[emailer] Processing email", { emailId, leadId, workspaceId });

  // 1. Fetch email record
  const [emailRecord] = await db
    .select()
    .from(outreachEmails)
    .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.workspaceId, workspaceId)))
    .limit(1);

  if (!emailRecord) {
    console.error("[emailer] Email record not found", { emailId });
    return false;
  }

  if (emailRecord.status !== "queued" && emailRecord.status !== "draft") {
    console.warn("[emailer] Email already processed", { emailId, status: emailRecord.status });
    return false;
  }

  // 2. Fetch lead for merge fields
  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!lead) {
    console.error("[emailer] Lead not found", { leadId });
    return false;
  }

  // 3. Render template with merge fields
  const renderedSubject = renderTemplate(emailRecord.subject, lead);
  const renderedBody = renderTemplate(emailRecord.body, lead);

  // 4. Send via AWS SES
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) throw new Error("SES_FROM_EMAIL is required");

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [emailRecord.toEmail],
    },
    Message: {
      Subject: { Data: renderedSubject, Charset: "UTF-8" },
      Body: {
        Html: { Data: renderedBody, Charset: "UTF-8" },
      },
    },
  });

  const sesResponse = await ses.send(command);
  const sesMessageId = sesResponse.MessageId;

  if (!sesMessageId) {
    throw new Error("SES did not return a MessageId");
  }

  console.log("[emailer] SES sent successfully", { sesMessageId, to: emailRecord.toEmail });

  // 5. Update email record
  const now = new Date();
  await db
    .update(outreachEmails)
    .set({
      status: "sent",
      sentAt: now,
      providerMessageId: sesMessageId,
    })
    .where(eq(outreachEmails.id, emailId));

  // 6. Update lead's lastContactedAt
  await db
    .update(leads)
    .set({ lastContactedAt: now, updatedAt: now })
    .where(eq(leads.id, leadId));

  // 7. Emit domain event (best-effort)
  try {
    const { emitEvent } = await import("../../packages/events/bus");
    await emitEvent("outreach.email.sent", workspaceId, "emailer", {
      emailId,
      leadId,
      toEmail: emailRecord.toEmail,
    });
  } catch {
    console.warn("[emailer] Failed to emit event (non-fatal)");
  }

  console.log("[emailer] Email processed", { emailId, to: emailRecord.toEmail });
  return true;
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler: SQSHandler = async (event: SQSEvent) => {
  console.log("[emailer] Received", event.Records.length, "records");

  const results = await Promise.allSettled(
    event.Records.map((record) => processEmail(record)),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = results.length - succeeded;

  console.log("[emailer] Batch complete", { succeeded, failed, total: results.length });
};
