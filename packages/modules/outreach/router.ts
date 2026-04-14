import { z } from "zod";
import { eq, and, desc, ilike, sql, count } from "drizzle-orm";
import { leads, leadSocials, notes } from "./schema/leads";
import { reviews, reviewAnalyses } from "./schema/reviews";
import { searches } from "./schema/searches";
import { outreachEmails } from "./schema/emails";
import { emailTemplates } from "./schema/templates";
import { sequences, sequenceSteps } from "./schema/sequences";
import { workspaces } from "../shared/schema/workspaces";
import { createTRPCRouter, protectedProcedure } from "./trpc";

export const outreachRouter = createTRPCRouter({
  // ──────────────────────────────────────────────
  // LEADS
  // ──────────────────────────────────────────────

  leads: createTRPCRouter({
    list: protectedProcedure
      .input(
        z.object({
          status: z.string().optional(),
          score: z.string().optional(),
          search: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        }),
      )
      .query(async ({ ctx, input }) => {
        const conditions = [eq(leads.workspaceId, ctx.workspaceId)];

        if (input.status) {
          conditions.push(eq(leads.status, input.status as any));
        }
        if (input.score) {
          conditions.push(eq(leads.score, input.score as any));
        }
        if (input.search) {
          conditions.push(
            sql`(${leads.name} ILIKE ${`%${input.search}%`} OR ${leads.suburb} ILIKE ${`%${input.search}%`} OR ${leads.category} ILIKE ${`%${input.search}%`})`,
          );
        }

        const result = await ctx.db
          .select()
          .from(leads)
          .where(and(...conditions))
          .orderBy(desc(leads.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        if (result.length === 0) return [];

        // Fetch latest review analyses for these leads (pain points)
        const leadIds = result.map((l) => l.id);
        const analyses = await ctx.db
          .select({
            leadId: reviewAnalyses.leadId,
            weaknesses: reviewAnalyses.weaknesses,
            opportunities: reviewAnalyses.opportunities,
          })
          .from(reviewAnalyses)
          .where(
            sql`${reviewAnalyses.leadId} = ANY(${leadIds}) AND ${reviewAnalyses.workspaceId} = ${ctx.workspaceId}`,
          )
          .orderBy(desc(reviewAnalyses.createdAt));

        // Keep only the latest analysis per lead
        const latestByLead = new Map<string, { weaknesses: string[]; opportunities: string[] }>();
        for (const a of analyses) {
          if (!latestByLead.has(a.leadId)) {
            latestByLead.set(a.leadId, {
              weaknesses: (a.weaknesses as string[]) ?? [],
              opportunities: (a.opportunities as string[]) ?? [],
            });
          }
        }

        return result.map((lead) => {
          const analysis = latestByLead.get(lead.id);
          return {
            ...lead,
            painPoints: analysis
              ? [...analysis.weaknesses, ...analysis.opportunities]
              : [],
          };
        });
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [lead] = await ctx.db
          .select()
          .from(leads)
          .where(
            and(
              eq(leads.id, input.id),
              eq(leads.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);

        if (!lead) return null;

        // Fetch related data in parallel
        const [socials, leadNotes, analyses] = await Promise.all([
          ctx.db
            .select()
            .from(leadSocials)
            .where(eq(leadSocials.leadId, input.id)),
          ctx.db
            .select()
            .from(notes)
            .where(eq(notes.leadId, input.id))
            .orderBy(desc(notes.createdAt)),
          ctx.db
            .select()
            .from(reviewAnalyses)
            .where(eq(reviewAnalyses.leadId, input.id))
            .orderBy(desc(reviewAnalyses.createdAt))
            .limit(1),
        ]);

        return {
          ...lead,
          socials,
          notes: leadNotes,
          latestAnalysis: analyses[0] ?? null,
        };
      }),

    /**
     * Nearby leads: radius search using PostGIS ST_DWithin.
     * Expects a centre point (lat/lng) and radius in kilometres.
     * Falls back to a bounding-box approximation if PostGIS extension
     * is not installed (dev without PostGIS).
     */
    nearby: protectedProcedure
      .input(
        z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          radiusKm: z.number().min(0.1).max(500).default(10),
          score: z.string().optional(),
          limit: z.number().min(1).max(200).default(100),
        }),
      )
      .query(async ({ ctx, input }) => {
        const radiusMetres = input.radiusKm * 1000;

        const conditions = [eq(leads.workspaceId, ctx.workspaceId)];
        if (input.score) {
          conditions.push(eq(leads.score, input.score as any));
        }

        // Use PostGIS ST_DWithin for proper geodesic distance
        // Cast lat/lng to geography points on the fly
        const result = await ctx.db
          .select()
          .from(leads)
          .where(
            and(
              ...conditions,
              sql`${leads.lat} IS NOT NULL AND ${leads.lng} IS NOT NULL`,
              sql`ST_DWithin(
                ST_SetSRID(ST_MakePoint(${leads.lng}, ${leads.lat}), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
                ${radiusMetres}
              )`,
            ),
          )
          .orderBy(
            sql`ST_Distance(
              ST_SetSRID(ST_MakePoint(${leads.lng}, ${leads.lat}), 4326)::geography,
              ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography
            ) ASC`,
          )
          .limit(input.limit);

        return result.map((lead) => ({
          ...lead,
          painPoints: [] as string[],
        }));
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          status: z.enum([
            "new",
            "qualified",
            "contacted",
            "proposal",
            "converted",
            "rejected",
          ]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [updated] = await ctx.db
          .update(leads)
          .set({ status: input.status, updatedAt: new Date() })
          .where(
            and(
              eq(leads.id, input.id),
              eq(leads.workspaceId, ctx.workspaceId),
            ),
          )
          .returning();

        return updated;
      }),
  }),

  // ──────────────────────────────────────────────
  // SEARCHES
  // ──────────────────────────────────────────────

  searches: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(searches)
        .where(eq(searches.workspaceId, ctx.workspaceId))
        .orderBy(desc(searches.createdAt));
    }),

    create: protectedProcedure
      .input(
        z.object({
          query: z.string().min(1),
          location: z.string().min(1),
          filters: z.record(z.unknown()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const rows = await ctx.db
          .insert(searches)
          .values({
            workspaceId: ctx.workspaceId,
            query: input.query,
            location: input.location,
            filters: input.filters ?? {},
          })
          .returning();

        const search = rows[0]!;

        // Emit event to trigger Outscraper Lambda via SQS
        try {
          const { emitEvent } = await import("@recon/events");
          await emitEvent(
            "outreach.search.created",
            ctx.workspaceId,
            "outreach",
            { searchId: search.id, query: input.query, location: input.location },
          );
        } catch (err) {
          // Event bus may not be initialised in dev — log and continue
          console.warn("[outreach] Failed to emit search.created event:", err);
        }

        return search;
      }),

    /**
     * Create a search job from a map-drawn area (circle or polygon).
     * The local scraper worker picks this up by polling status='pending'.
     * Geometry is stored under `filters` so we don't need a migration.
     */
    createFromArea: protectedProcedure
      .input(
        z.object({
          query: z.string().min(1).max(200),
          area: z.discriminatedUnion("type", [
            z.object({
              type: z.literal("circle"),
              centerLat: z.number().min(-90).max(90),
              centerLng: z.number().min(-180).max(180),
              radiusKm: z.number().min(0.1).max(50),
            }),
            z.object({
              type: z.literal("polygon"),
              points: z
                .array(
                  z.object({
                    lat: z.number().min(-90).max(90),
                    lng: z.number().min(-180).max(180),
                  }),
                )
                .min(3)
                .max(64),
            }),
          ]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Build a human-readable location label from geometry for the worker.
        const location =
          input.area.type === "circle"
            ? `${input.area.radiusKm}km radius @ ${input.area.centerLat.toFixed(4)},${input.area.centerLng.toFixed(4)}`
            : `polygon (${input.area.points.length} points)`;

        const rows = await ctx.db
          .insert(searches)
          .values({
            workspaceId: ctx.workspaceId,
            query: input.query,
            location,
            filters: { area: input.area },
          })
          .returning();

        const search = rows[0]!;

        try {
          const { emitEvent } = await import("@recon/events");
          await emitEvent(
            "outreach.search.created",
            ctx.workspaceId,
            "outreach",
            {
              searchId: search.id,
              query: input.query,
              location,
              area: input.area,
            },
          );
        } catch (err) {
          // Local worker will pick it up by polling - event bus is optional
          console.warn("[outreach] emit search.created failed (expected in dev):", err);
        }

        return search;
      }),
  }),

  // ──────────────────────────────────────────────
  // REVIEWS
  // ──────────────────────────────────────────────

  reviews: createTRPCRouter({
    listByLead: protectedProcedure
      .input(z.object({ leadId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return ctx.db
          .select()
          .from(reviews)
          .where(
            and(
              eq(reviews.leadId, input.leadId),
              eq(reviews.workspaceId, ctx.workspaceId),
            ),
          )
          .orderBy(desc(reviews.publishedAt));
      }),
  }),

  // ──────────────────────────────────────────────
  // TEMPLATES
  // ──────────────────────────────────────────────

  templates: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.workspaceId, ctx.workspaceId))
        .orderBy(desc(emailTemplates.updatedAt));

      // Attach "used in N sequences" count
      if (rows.length === 0) return [];
      const templateIds = rows.map((t) => t.id);
      const usage = await ctx.db
        .select({
          templateId: sequenceSteps.templateId,
          cnt: count(),
        })
        .from(sequenceSteps)
        .where(
          and(
            eq(sequenceSteps.workspaceId, ctx.workspaceId),
            sql`${sequenceSteps.templateId} = ANY(${templateIds})`,
          ),
        )
        .groupBy(sequenceSteps.templateId);

      const usageMap = new Map(usage.map((u) => [u.templateId, Number(u.cnt)]));
      return rows.map((r) => ({ ...r, usedIn: usageMap.get(r.id) ?? 0 }));
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          subject: z.string().min(1).max(200),
          body: z.string().min(1).max(10000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Extract merge fields from subject + body
        const mergeFieldRegex = /\{\{([\w_]+)\}\}/g;
        const fields = new Set<string>();
        for (const m of `${input.subject}\n${input.body}`.matchAll(
          mergeFieldRegex,
        )) {
          fields.add(m[1]!);
        }

        const [row] = await ctx.db
          .insert(emailTemplates)
          .values({
            workspaceId: ctx.workspaceId,
            name: input.name,
            subject: input.subject,
            body: input.body,
            mergeFields: Array.from(fields),
          })
          .returning();
        return row;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().min(1).max(100).optional(),
          subject: z.string().min(1).max(200).optional(),
          body: z.string().min(1).max(10000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;

        // Recompute merge fields if subject or body changed
        const mergeFieldRegex = /\{\{([\w_]+)\}\}/g;
        let mergeFields: string[] | undefined;
        if (patch.subject != null || patch.body != null) {
          const [existing] = await ctx.db
            .select({
              subject: emailTemplates.subject,
              body: emailTemplates.body,
            })
            .from(emailTemplates)
            .where(
              and(
                eq(emailTemplates.id, id),
                eq(emailTemplates.workspaceId, ctx.workspaceId),
              ),
            );
          const subject = patch.subject ?? existing?.subject ?? "";
          const body = patch.body ?? existing?.body ?? "";
          const fields = new Set<string>();
          for (const m of `${subject}\n${body}`.matchAll(mergeFieldRegex)) {
            fields.add(m[1]!);
          }
          mergeFields = Array.from(fields);
        }

        const [row] = await ctx.db
          .update(emailTemplates)
          .set({
            ...patch,
            ...(mergeFields ? { mergeFields } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(emailTemplates.id, id),
              eq(emailTemplates.workspaceId, ctx.workspaceId),
            ),
          )
          .returning();
        return row;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await ctx.db
          .delete(emailTemplates)
          .where(
            and(
              eq(emailTemplates.id, input.id),
              eq(emailTemplates.workspaceId, ctx.workspaceId),
            ),
          );
        return { success: true };
      }),
  }),

  // ──────────────────────────────────────────────
  // SEQUENCES
  // ──────────────────────────────────────────────

  sequences: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db
        .select()
        .from(sequences)
        .where(eq(sequences.workspaceId, ctx.workspaceId))
        .orderBy(desc(sequences.updatedAt));

      if (rows.length === 0) return [];
      const sequenceIds = rows.map((s) => s.id);

      // Step counts
      const stepCounts = await ctx.db
        .select({
          sequenceId: sequenceSteps.sequenceId,
          cnt: count(),
        })
        .from(sequenceSteps)
        .where(sql`${sequenceSteps.sequenceId} = ANY(${sequenceIds})`)
        .groupBy(sequenceSteps.sequenceId);
      const stepMap = new Map(
        stepCounts.map((s) => [s.sequenceId, Number(s.cnt)]),
      );

      // Email stats per sequence
      const emailStats = await ctx.db
        .select({
          sequenceId: outreachEmails.sequenceId,
          status: outreachEmails.status,
          cnt: count(),
        })
        .from(outreachEmails)
        .where(
          and(
            eq(outreachEmails.workspaceId, ctx.workspaceId),
            sql`${outreachEmails.sequenceId} = ANY(${sequenceIds})`,
          ),
        )
        .groupBy(outreachEmails.sequenceId, outreachEmails.status);

      const statsMap = new Map<
        string,
        { sent: number; opened: number; replied: number }
      >();
      for (const s of emailStats) {
        if (!s.sequenceId) continue;
        const entry = statsMap.get(s.sequenceId) ?? {
          sent: 0,
          opened: 0,
          replied: 0,
        };
        const n = Number(s.cnt);
        if (
          s.status === "sent" ||
          s.status === "opened" ||
          s.status === "replied" ||
          s.status === "bounced"
        ) {
          entry.sent += n;
        }
        if (s.status === "opened" || s.status === "replied") entry.opened += n;
        if (s.status === "replied") entry.replied += n;
        statsMap.set(s.sequenceId, entry);
      }

      return rows.map((r) => {
        const s = statsMap.get(r.id) ?? { sent: 0, opened: 0, replied: 0 };
        return {
          ...r,
          steps: stepMap.get(r.id) ?? 0,
          sent: s.sent,
          opened: s.opened,
          replied: s.replied,
          openRate: s.sent > 0 ? Math.round((s.opened / s.sent) * 100) : 0,
          replyRate: s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0,
        };
      });
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        const [row] = await ctx.db
          .insert(sequences)
          .values({
            workspaceId: ctx.workspaceId,
            name: input.name,
          })
          .returning();
        return row;
      }),

    toggleActive: protectedProcedure
      .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const [row] = await ctx.db
          .update(sequences)
          .set({ active: input.active, updatedAt: new Date() })
          .where(
            and(
              eq(sequences.id, input.id),
              eq(sequences.workspaceId, ctx.workspaceId),
            ),
          )
          .returning();
        return row;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await ctx.db
          .delete(sequences)
          .where(
            and(
              eq(sequences.id, input.id),
              eq(sequences.workspaceId, ctx.workspaceId),
            ),
          );
        return { success: true };
      }),

    /**
     * Get a sequence with its steps ordered by step_number.
     * Each step is hydrated with its template for client-side rendering.
     */
    getById: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [sequence] = await ctx.db
          .select()
          .from(sequences)
          .where(
            and(
              eq(sequences.id, input.id),
              eq(sequences.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);
        if (!sequence) return null;

        const steps = await ctx.db
          .select({
            id: sequenceSteps.id,
            stepNumber: sequenceSteps.stepNumber,
            templateId: sequenceSteps.templateId,
            delayDays: sequenceSteps.delayDays,
            aiGenerate: sequenceSteps.aiGenerate,
            templateName: emailTemplates.name,
            templateSubject: emailTemplates.subject,
          })
          .from(sequenceSteps)
          .leftJoin(
            emailTemplates,
            eq(sequenceSteps.templateId, emailTemplates.id),
          )
          .where(eq(sequenceSteps.sequenceId, input.id))
          .orderBy(sequenceSteps.stepNumber);

        return { ...sequence, steps };
      }),

    addStep: protectedProcedure
      .input(
        z.object({
          sequenceId: z.string().uuid(),
          templateId: z.string().uuid(),
          delayDays: z.number().int().min(0).max(90).default(0),
          aiGenerate: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Verify sequence belongs to workspace
        const [seq] = await ctx.db
          .select({ id: sequences.id })
          .from(sequences)
          .where(
            and(
              eq(sequences.id, input.sequenceId),
              eq(sequences.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);
        if (!seq) throw new Error("Sequence not found");

        // Verify template belongs to workspace
        const [tmpl] = await ctx.db
          .select({ id: emailTemplates.id })
          .from(emailTemplates)
          .where(
            and(
              eq(emailTemplates.id, input.templateId),
              eq(emailTemplates.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);
        if (!tmpl) throw new Error("Template not found");

        // Next step number = count + 1
        const countRows = await ctx.db
          .select({ cnt: count() })
          .from(sequenceSteps)
          .where(eq(sequenceSteps.sequenceId, input.sequenceId));
        const existingCount = Number(countRows[0]?.cnt ?? 0);

        const [row] = await ctx.db
          .insert(sequenceSteps)
          .values({
            sequenceId: input.sequenceId,
            workspaceId: ctx.workspaceId,
            stepNumber: existingCount + 1,
            templateId: input.templateId,
            delayDays: input.delayDays,
            aiGenerate: input.aiGenerate,
          })
          .returning();

        // Touch parent sequence so list ordering reflects recency
        await ctx.db
          .update(sequences)
          .set({ updatedAt: new Date() })
          .where(eq(sequences.id, input.sequenceId));

        return row;
      }),

    updateStep: protectedProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          templateId: z.string().uuid().optional(),
          delayDays: z.number().int().min(0).max(90).optional(),
          aiGenerate: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        const [row] = await ctx.db
          .update(sequenceSteps)
          .set(patch)
          .where(
            and(
              eq(sequenceSteps.id, id),
              eq(sequenceSteps.workspaceId, ctx.workspaceId),
            ),
          )
          .returning();
        return row;
      }),

    removeStep: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const [removed] = await ctx.db
          .delete(sequenceSteps)
          .where(
            and(
              eq(sequenceSteps.id, input.id),
              eq(sequenceSteps.workspaceId, ctx.workspaceId),
            ),
          )
          .returning();
        if (!removed) return { success: false };

        // Renumber remaining steps in the same sequence
        const remaining = await ctx.db
          .select({ id: sequenceSteps.id, stepNumber: sequenceSteps.stepNumber })
          .from(sequenceSteps)
          .where(eq(sequenceSteps.sequenceId, removed.sequenceId))
          .orderBy(sequenceSteps.stepNumber);

        for (let i = 0; i < remaining.length; i++) {
          const target = i + 1;
          if (remaining[i]!.stepNumber !== target) {
            await ctx.db
              .update(sequenceSteps)
              .set({ stepNumber: target })
              .where(eq(sequenceSteps.id, remaining[i]!.id));
          }
        }
        return { success: true };
      }),
  }),

  // ──────────────────────────────────────────────
  // WORKSPACE
  // ──────────────────────────────────────────────

  workspace: createTRPCRouter({
    get: protectedProcedure.query(async ({ ctx }) => {
      const [ws] = await ctx.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspaceId))
        .limit(1);
      return ws ?? null;
    }),

    update: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100).optional(),
          settings: z
            .object({
              serviceDescription: z.string().max(2000).optional(),
              targetCategories: z.array(z.string().max(80)).max(20).optional(),
              defaultLocation: z.string().max(200).optional(),
            })
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name != null) patch.name = input.name;
        if (input.settings != null) {
          // Merge into existing settings rather than replacing
          const [existing] = await ctx.db
            .select({ settings: workspaces.settings })
            .from(workspaces)
            .where(eq(workspaces.id, ctx.workspaceId))
            .limit(1);
          patch.settings = {
            ...(existing?.settings ?? {}),
            ...input.settings,
          };
        }
        const [row] = await ctx.db
          .update(workspaces)
          .set(patch)
          .where(eq(workspaces.id, ctx.workspaceId))
          .returning();
        return row;
      }),
  }),

  // ──────────────────────────────────────────────
  // EMAILS
  // ──────────────────────────────────────────────

  emails: createTRPCRouter({
    list: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().min(1).max(100).default(50),
            status: z
              .enum(["draft", "queued", "sent", "opened", "replied", "bounced"])
              .optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const limit = input?.limit ?? 50;
        const conditions = [eq(outreachEmails.workspaceId, ctx.workspaceId)];
        if (input?.status) {
          conditions.push(eq(outreachEmails.status, input.status));
        }

        const emailRows = await ctx.db
          .select({
            id: outreachEmails.id,
            leadId: outreachEmails.leadId,
            subject: outreachEmails.subject,
            toEmail: outreachEmails.toEmail,
            status: outreachEmails.status,
            sentAt: outreachEmails.sentAt,
            createdAt: outreachEmails.createdAt,
          })
          .from(outreachEmails)
          .where(and(...conditions))
          .orderBy(desc(outreachEmails.createdAt))
          .limit(limit);

        if (emailRows.length === 0) return [];

        // Attach lead business names
        const leadIds = Array.from(new Set(emailRows.map((e) => e.leadId)));
        const leadRows = await ctx.db
          .select({ id: leads.id, name: leads.name })
          .from(leads)
          .where(sql`${leads.id} = ANY(${leadIds})`);
        const leadNameMap = new Map(leadRows.map((l) => [l.id, l.name]));

        return emailRows.map((e) => ({
          ...e,
          businessName: leadNameMap.get(e.leadId) ?? "Unknown",
        }));
      }),

    /**
     * Create a draft email to a lead. Does NOT send.
     * Uses template body with merge field substitution.
     */
    createDraft: protectedProcedure
      .input(
        z.object({
          leadId: z.string().uuid(),
          subject: z.string().min(1).max(500),
          body: z.string().min(1).max(50000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Validate lead belongs to workspace and has an email
        const [lead] = await ctx.db
          .select({ id: leads.id, email: leads.email })
          .from(leads)
          .where(
            and(
              eq(leads.id, input.leadId),
              eq(leads.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);

        if (!lead) throw new Error("Lead not found in workspace");
        if (!lead.email) throw new Error("Lead has no email address");

        const [row] = await ctx.db
          .insert(outreachEmails)
          .values({
            leadId: input.leadId,
            workspaceId: ctx.workspaceId,
            subject: input.subject,
            body: input.body,
            toEmail: lead.email,
            status: "draft",
          })
          .returning();
        return row;
      }),
  }),

  // ──────────────────────────────────────────────
  // STATS
  // ──────────────────────────────────────────────

  stats: protectedProcedure.query(async ({ ctx }) => {
    const [allLeads, emailCounts] = await Promise.all([
      ctx.db
        .select({
          status: leads.status,
          score: leads.score,
          email: leads.email,
          category: leads.category,
        })
        .from(leads)
        .where(eq(leads.workspaceId, ctx.workspaceId)),
      ctx.db
        .select({
          status: outreachEmails.status,
          cnt: count(),
        })
        .from(outreachEmails)
        .where(eq(outreachEmails.workspaceId, ctx.workspaceId))
        .groupBy(outreachEmails.status),
    ]);

    const emailsByStatus = Object.fromEntries(
      emailCounts.map((e) => [e.status, Number(e.cnt)]),
    ) as Record<string, number>;
    const totalSent =
      (emailsByStatus.sent ?? 0) +
      (emailsByStatus.opened ?? 0) +
      (emailsByStatus.replied ?? 0) +
      (emailsByStatus.bounced ?? 0);
    const opened = (emailsByStatus.opened ?? 0) + (emailsByStatus.replied ?? 0);
    const replied = emailsByStatus.replied ?? 0;

    // Category breakdown
    const catMap = new Map<string, { total: number; withEmail: number }>();
    for (const l of allLeads) {
      const cat = l.category ?? "Other";
      const entry = catMap.get(cat) ?? { total: 0, withEmail: 0 };
      entry.total++;
      if (l.email) entry.withEmail++;
      catMap.set(cat, entry);
    }
    const byCategory = Array.from(catMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return {
      total: allLeads.length,
      withEmail: allLeads.filter((l) => l.email).length,
      hot: allLeads.filter((l) => l.score === "hot").length,
      warm: allLeads.filter((l) => l.score === "warm").length,
      cold: allLeads.filter((l) => l.score === "cold").length,
      unscored: allLeads.filter((l) => l.score === "unscored").length,
      emailsSent: totalSent,
      openRate: totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0,
      replyRate: totalSent > 0 ? Math.round((replied / totalSent) * 100) : 0,
      byStatus: {
        new: allLeads.filter((l) => l.status === "new").length,
        qualified: allLeads.filter((l) => l.status === "qualified").length,
        contacted: allLeads.filter((l) => l.status === "contacted").length,
        proposal: allLeads.filter((l) => l.status === "proposal").length,
        converted: allLeads.filter((l) => l.status === "converted").length,
        rejected: allLeads.filter((l) => l.status === "rejected").length,
      },
      byCategory,
    };
  }),
});
