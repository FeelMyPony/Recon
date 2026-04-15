import { z } from "zod";
import { eq, and, desc, ilike, sql, count } from "drizzle-orm";
import { leads, leadSocials, notes } from "./schema/leads";
import { reviews, reviewAnalyses } from "./schema/reviews";
import { searches } from "./schema/searches";
import { outreachEmails } from "./schema/emails";
import { emailTemplates } from "./schema/templates";
import { sequences, sequenceSteps } from "./schema/sequences";
import { sequenceEnrollments } from "./schema/sequence-enrollments";
import { workspaces } from "../shared/schema/workspaces";
import { users } from "../shared/schema/auth";
import { workspaceMembers } from "../shared/schema/members";
import { activityLog } from "../shared/schema/activity";
import { pitchPages } from "./schema/pitch-pages";
import { createTRPCRouter, protectedProcedure } from "./trpc";
import { TRPCError } from "@trpc/server";
import {
  scrapeSearch,
  fetchReviews,
  computeOpportunityScore,
} from "./services/scraper";
import { analyseLead, analyseLeads } from "./services/analyser";
import { draftEmail } from "./services/email-drafter";
import { generatePitchPage } from "./services/pitch-generator";
import { generateProposalPdf } from "./services/proposal-pdf";
import { sendEmail } from "./services/emailer";
import { enrollLeadsInSequence } from "./services/sequences";

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
          .orderBy(desc(leads.opportunityScore), desc(leads.createdAt))
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

    exportCsv: protectedProcedure
      .input(
        z.object({
          status: z.string().optional(),
          score: z.string().optional(),
          search: z.string().optional(),
        }).optional(),
      )
      .query(async ({ ctx, input }) => {
        const conditions = [eq(leads.workspaceId, ctx.workspaceId)];

        if (input?.status) {
          conditions.push(eq(leads.status, input.status as any));
        }
        if (input?.score) {
          conditions.push(eq(leads.score, input.score as any));
        }
        if (input?.search) {
          conditions.push(
            sql`(${leads.name} ILIKE ${`%${input.search}%`} OR ${leads.suburb} ILIKE ${`%${input.search}%`} OR ${leads.category} ILIKE ${`%${input.search}%`})`,
          );
        }

        const result = await ctx.db
          .select()
          .from(leads)
          .where(and(...conditions))
          .orderBy(desc(leads.opportunityScore), desc(leads.createdAt));

        const leadIds = result.map((l) => l.id);

        // Pain points per lead (latest review analysis)
        const painPointsByLead = new Map<string, string[]>();
        const aiScoreByLead = new Map<string, number>();
        if (leadIds.length > 0) {
          const analyses = await ctx.db
            .select({
              leadId: reviewAnalyses.leadId,
              weaknesses: reviewAnalyses.weaknesses,
              aiScore: reviewAnalyses.aiScore,
              createdAt: reviewAnalyses.createdAt,
            })
            .from(reviewAnalyses)
            .where(sql`${reviewAnalyses.leadId} = ANY(${leadIds})`)
            .orderBy(desc(reviewAnalyses.createdAt));
          // Keep first (latest) per lead
          for (const a of analyses) {
            if (!painPointsByLead.has(a.leadId)) {
              painPointsByLead.set(a.leadId, (a.weaknesses as string[]) ?? []);
              if (a.aiScore != null) aiScoreByLead.set(a.leadId, Number(a.aiScore));
            }
          }
        }

        // Email aggregates per lead: total sent, last status, last sent_at
        const emailStatsByLead = new Map<
          string,
          { sent: number; lastStatus: string | null; lastSentAt: Date | null }
        >();
        if (leadIds.length > 0) {
          const emailAgg = await ctx.db
            .select({
              leadId: outreachEmails.leadId,
              status: outreachEmails.status,
              sentAt: outreachEmails.sentAt,
              createdAt: outreachEmails.createdAt,
            })
            .from(outreachEmails)
            .where(sql`${outreachEmails.leadId} = ANY(${leadIds})`)
            .orderBy(desc(outreachEmails.createdAt));
          for (const e of emailAgg) {
            const entry = emailStatsByLead.get(e.leadId) ?? {
              sent: 0,
              lastStatus: null as string | null,
              lastSentAt: null as Date | null,
            };
            if (e.status && e.status !== "draft") entry.sent += 1;
            if (entry.lastStatus == null) {
              entry.lastStatus = e.status ?? null;
              entry.lastSentAt = e.sentAt ?? null;
            }
            emailStatsByLead.set(e.leadId, entry);
          }
        }

        // Build CSV — enriched columns
        const headers = [
          "Name", "Category", "Suburb", "State", "Postcode",
          "Rating", "Reviews", "Email", "Phone", "Website",
          "Status", "Score", "Opportunity Score", "AI Score",
          "Pain Points", "Emails Sent", "Last Email Status",
          "Last Sent At", "Last Contacted At", "Google Maps URL",
        ];

        const escapeField = (val: string | number | null | undefined) => {
          if (val == null) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        const rows = result.map((lead) => {
          const painPoints = painPointsByLead.get(lead.id) ?? [];
          const aiScore = aiScoreByLead.get(lead.id);
          const stats = emailStatsByLead.get(lead.id);
          return [
            lead.name,
            lead.category,
            lead.suburb,
            lead.state,
            lead.postcode,
            lead.rating,
            lead.reviewCount,
            lead.email,
            lead.phone,
            lead.website,
            lead.status,
            lead.score,
            lead.opportunityScore,
            aiScore ?? "",
            painPoints.join(" | "),
            stats?.sent ?? 0,
            stats?.lastStatus ?? "",
            stats?.lastSentAt ? stats.lastSentAt.toISOString() : "",
            lead.lastContactedAt ? lead.lastContactedAt.toISOString() : "",
            lead.googleMapsUrl,
          ]
            .map(escapeField)
            .join(",");
        });

        return [headers.join(","), ...rows].join("\n");
      }),

    importCsv: protectedProcedure
      .input(z.object({ csvData: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const lines = input.csvData.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          return { imported: 0, skipped: 0, errors: ["CSV must have a header row and at least one data row"] };
        }

        // Parse CSV line respecting quoted fields
        const parseLine = (line: string): string[] => {
          const fields: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i]!;
            if (inQuotes) {
              if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                  current += '"';
                  i++;
                } else {
                  inQuotes = false;
                }
              } else {
                current += ch;
              }
            } else {
              if (ch === '"') {
                inQuotes = true;
              } else if (ch === ",") {
                fields.push(current.trim());
                current = "";
              } else {
                current += ch;
              }
            }
          }
          fields.push(current.trim());
          return fields;
        };

        const headerRow = parseLine(lines[0]!);
        const headerMap = new Map<string, number>();
        headerRow.forEach((h, i) => headerMap.set(h.toLowerCase(), i));

        const col = (row: string[], name: string): string | undefined => {
          const idx = headerMap.get(name.toLowerCase());
          if (idx == null) return undefined;
          const val = row[idx]?.trim();
          return val || undefined;
        };

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const row = parseLine(lines[i]!);
          const name = col(row, "name");

          if (!name) {
            skipped++;
            errors.push(`Row ${i + 1}: missing name, skipped`);
            continue;
          }

          const googlePlaceId = col(row, "google_place_id") ?? col(row, "googleplaceid");

          // Check duplicate by google_place_id
          if (googlePlaceId) {
            const existing = await ctx.db
              .select({ id: leads.id })
              .from(leads)
              .where(
                and(
                  eq(leads.workspaceId, ctx.workspaceId),
                  eq(leads.googlePlaceId, googlePlaceId),
                ),
              )
              .limit(1);

            if (existing.length > 0) {
              skipped++;
              errors.push(`Row ${i + 1}: duplicate google_place_id "${googlePlaceId}", skipped`);
              continue;
            }
          }

          const ratingRaw = col(row, "rating");
          const reviewCountRaw = col(row, "reviews") ?? col(row, "reviewcount") ?? col(row, "review_count");

          try {
            await ctx.db.insert(leads).values({
              workspaceId: ctx.workspaceId,
              name,
              category: col(row, "category"),
              suburb: col(row, "suburb"),
              state: col(row, "state"),
              postcode: col(row, "postcode"),
              rating: ratingRaw ?? null,
              reviewCount: reviewCountRaw ? parseInt(reviewCountRaw, 10) || 0 : 0,
              email: col(row, "email"),
              phone: col(row, "phone"),
              website: col(row, "website"),
              googlePlaceId: googlePlaceId ?? null,
              googleMapsUrl: col(row, "google maps url") ?? col(row, "googlemapsurl") ?? col(row, "google_maps_url"),
            });
            imported++;
          } catch (err: any) {
            skipped++;
            errors.push(`Row ${i + 1}: ${err.message ?? "insert failed"}`);
          }
        }

        return { imported, skipped, errors };
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
        // Fetch old status before updating
        const [existing] = await ctx.db
          .select({ status: leads.status })
          .from(leads)
          .where(
            and(
              eq(leads.id, input.id),
              eq(leads.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);

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

        try {
          await ctx.db.insert(activityLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            leadId: input.id,
            action: "lead_status_changed",
            details: { leadId: input.id, from: existing?.status ?? "unknown", to: input.status },
          });
        } catch (e) {
          console.warn("[activity] Failed to log lead_status_changed:", e);
        }

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
          filters: z
            .object({
              /** Only keep leads with rating >= this value (e.g., 4.0) */
              minRating: z.number().min(0).max(5).optional(),
              /** Only keep leads with at least this many reviews */
              minReviewCount: z.number().min(0).optional(),
              /** If true, exclude leads that already have a website */
              excludeWithWebsite: z.boolean().optional(),
              /** If true, only keep leads that have an email */
              requireEmail: z.boolean().optional(),
            })
            .optional(),
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

        // Log activity
        try {
          await ctx.db.insert(activityLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "search_created",
            details: { query: input.query, location: input.location },
          });
        } catch (e) {
          console.warn("[activity] Failed to log search_created:", e);
        }

        // Run scraping synchronously so it actually completes on Vercel serverless.
        // (Fire-and-forget promises get killed when the function returns.)
        // Outscraper sync mode with limit=50 typically returns in 10-15s; maxDuration is 60s.
        try {
          console.log("[pipeline] Starting scrape for search", search.id);
          const result = await scrapeSearch(ctx.db, search.id, ctx.workspaceId);
          console.log(
            "[pipeline] Scrape complete:",
            result.newLeadIds.length,
            "new leads,",
            result.updatedCount,
            "updated",
          );

          // Analyse only the first 3 leads inline to stay within the serverless
          // timeout budget. Remaining leads can be analysed on-demand via
          // outreach.analyseLead when the user views them.
          const toAnalyseNow = result.newLeadIds.slice(0, 3);
          if (toAnalyseNow.length > 0) {
            console.log("[pipeline] Analysing first", toAnalyseNow.length, "leads inline...");
            await analyseLeads(ctx.db, toAnalyseNow, ctx.workspaceId);
            console.log("[pipeline] Inline analysis complete");
          }
        } catch (err) {
          console.error("[pipeline] Scrape/analyse failed:", err);
          // Don't throw — return the search record even if scraping failed
          // so the UI can show the failed status
        }

        // Fetch the updated search (scrapeSearch updates status + result_count)
        const [updatedSearch] = await ctx.db
          .select()
          .from(searches)
          .where(eq(searches.id, search.id))
          .limit(1);

        return updatedSearch ?? search;
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

        try {
          await ctx.db.insert(activityLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "template_created",
            details: { templateName: input.name },
          });
        } catch (e) {
          console.warn("[activity] Failed to log template_created:", e);
        }

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

        try {
          await ctx.db.insert(activityLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sequence_created",
            details: { sequenceName: input.name },
          });
        } catch (e) {
          console.warn("[activity] Failed to log sequence_created:", e);
        }

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

    // ──────────────────────────────────────────────
    // Enrollments — lead progression through a sequence
    // ──────────────────────────────────────────────

    /** Enroll up to 100 leads in a sequence. First step fires on next cron tick. */
    enroll: protectedProcedure
      .input(
        z.object({
          sequenceId: z.string().uuid(),
          leadIds: z.array(z.string().uuid()).min(1).max(100),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const r = await enrollLeadsInSequence(
          ctx.workspaceId,
          input.sequenceId,
          input.leadIds,
        );
        try {
          await ctx.db.insert(activityLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sequence_enrolled",
            details: {
              sequenceId: input.sequenceId,
              enrolled: r.enrolled,
              skipped: r.skipped,
            },
          });
        } catch (e) {
          console.warn("[activity] Failed to log sequence_enrolled:", e);
        }
        return r;
      }),

    /** Manually stop an active enrollment. */
    stopEnrollment: protectedProcedure
      .input(z.object({ enrollmentId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const [row] = await ctx.db
          .update(sequenceEnrollments)
          .set({ status: "stopped_manual", updatedAt: new Date() })
          .where(
            and(
              eq(sequenceEnrollments.id, input.enrollmentId),
              eq(sequenceEnrollments.workspaceId, ctx.workspaceId),
            ),
          )
          .returning();
        return row ?? null;
      }),

    /** List enrollments for a sequence with lead names. */
    listEnrollments: protectedProcedure
      .input(z.object({ sequenceId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const rows = await ctx.db
          .select({
            id: sequenceEnrollments.id,
            leadId: sequenceEnrollments.leadId,
            leadName: leads.name,
            leadEmail: leads.email,
            currentStep: sequenceEnrollments.currentStep,
            status: sequenceEnrollments.status,
            nextSendAt: sequenceEnrollments.nextSendAt,
            lastError: sequenceEnrollments.lastError,
            createdAt: sequenceEnrollments.createdAt,
          })
          .from(sequenceEnrollments)
          .leftJoin(leads, eq(sequenceEnrollments.leadId, leads.id))
          .where(
            and(
              eq(sequenceEnrollments.sequenceId, input.sequenceId),
              eq(sequenceEnrollments.workspaceId, ctx.workspaceId),
            ),
          )
          .orderBy(desc(sequenceEnrollments.createdAt))
          .limit(200);
        return rows;
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

    /** List all members of the current workspace, including pending invites */
    members: protectedProcedure.query(async ({ ctx }) => {
      // Get the workspace to know the owner
      const [ws] = await ctx.db
        .select({ ownerId: workspaces.ownerId })
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspaceId))
        .limit(1);

      if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

      // Fetch all workspace_members rows with joined user info
      const members = await ctx.db
        .select({
          id: workspaceMembers.id,
          workspaceId: workspaceMembers.workspaceId,
          userId: workspaceMembers.userId,
          role: workspaceMembers.role,
          invitedEmail: workspaceMembers.invitedEmail,
          invitedAt: workspaceMembers.invitedAt,
          acceptedAt: workspaceMembers.acceptedAt,
          createdAt: workspaceMembers.createdAt,
          userName: users.name,
          userEmail: users.email,
          userImage: users.image,
        })
        .from(workspaceMembers)
        .leftJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
        .orderBy(workspaceMembers.createdAt);

      // Also include the workspace owner (they may not have a workspace_members row)
      const [owner] = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
        })
        .from(users)
        .where(eq(users.id, ws.ownerId))
        .limit(1);

      const ownerInMembers = members.some(
        (m) => m.userId === ws.ownerId && m.role === "owner",
      );

      const result = ownerInMembers
        ? members
        : [
            // Synthesize an owner entry if they don't have a workspace_members row
            {
              id: "owner",
              workspaceId: ctx.workspaceId,
              userId: ws.ownerId,
              role: "owner" as const,
              invitedEmail: null,
              invitedAt: null,
              acceptedAt: null,
              createdAt: null,
              userName: owner?.name ?? null,
              userEmail: owner?.email ?? null,
              userImage: owner?.image ?? null,
            },
            ...members,
          ];

      return result;
    }),

    /** Invite a user to the workspace by email */
    invite: protectedProcedure
      .input(
        z.object({
          email: z.string().email().max(255),
          role: z.enum(["admin", "member", "viewer"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Check that the current user is the workspace owner
        const [ws] = await ctx.db
          .select({ ownerId: workspaces.ownerId })
          .from(workspaces)
          .where(eq(workspaces.id, ctx.workspaceId))
          .limit(1);

        if (!ws || ws.ownerId !== ctx.userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the workspace owner can invite members",
          });
        }

        // Check if already invited
        const [existing] = await ctx.db
          .select({ id: workspaceMembers.id })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, ctx.workspaceId),
              eq(workspaceMembers.invitedEmail, input.email.toLowerCase()),
            ),
          )
          .limit(1);

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email has already been invited",
          });
        }

        // Check if the user already exists and is already a member
        const [existingUser] = await ctx.db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email.toLowerCase()))
          .limit(1);

        if (existingUser) {
          const [alreadyMember] = await ctx.db
            .select({ id: workspaceMembers.id })
            .from(workspaceMembers)
            .where(
              and(
                eq(workspaceMembers.workspaceId, ctx.workspaceId),
                eq(workspaceMembers.userId, existingUser.id),
              ),
            )
            .limit(1);

          if (alreadyMember) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This user is already a member of the workspace",
            });
          }
        }

        const [row] = await ctx.db
          .insert(workspaceMembers)
          .values({
            workspaceId: ctx.workspaceId,
            invitedEmail: input.email.toLowerCase(),
            role: input.role,
            // user_id is null until they accept the invite
          })
          .returning();

        try {
          await ctx.db.insert(activityLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "member_invited",
            details: { email: input.email.toLowerCase(), role: input.role },
          });
        } catch (e) {
          console.warn("[activity] Failed to log member_invited:", e);
        }

        return row;
      }),

    /** Remove a member from the workspace */
    removeMember: protectedProcedure
      .input(z.object({ memberId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Only owner can remove members
        const [ws] = await ctx.db
          .select({ ownerId: workspaces.ownerId })
          .from(workspaces)
          .where(eq(workspaces.id, ctx.workspaceId))
          .limit(1);

        if (!ws || ws.ownerId !== ctx.userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the workspace owner can remove members",
          });
        }

        // Find the member to remove
        const [member] = await ctx.db
          .select({ id: workspaceMembers.id, role: workspaceMembers.role, userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.id, input.memberId),
              eq(workspaceMembers.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);

        if (!member) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
        }

        // Cannot remove the owner
        if (member.role === "owner" || member.userId === ws.ownerId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot remove the workspace owner",
          });
        }

        await ctx.db
          .delete(workspaceMembers)
          .where(eq(workspaceMembers.id, input.memberId));

        return { success: true };
      }),

    /** Update a member's role */
    updateRole: protectedProcedure
      .input(
        z.object({
          memberId: z.string(),
          role: z.enum(["admin", "member", "viewer"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Only owner can change roles
        const [ws] = await ctx.db
          .select({ ownerId: workspaces.ownerId })
          .from(workspaces)
          .where(eq(workspaces.id, ctx.workspaceId))
          .limit(1);

        if (!ws || ws.ownerId !== ctx.userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the workspace owner can change roles",
          });
        }

        // Find the member
        const [member] = await ctx.db
          .select({ id: workspaceMembers.id, role: workspaceMembers.role, userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.id, input.memberId),
              eq(workspaceMembers.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);

        if (!member) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
        }

        // Cannot change owner's role
        if (member.role === "owner" || member.userId === ws.ownerId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot change the workspace owner's role",
          });
        }

        const [row] = await ctx.db
          .update(workspaceMembers)
          .set({ role: input.role })
          .where(eq(workspaceMembers.id, input.memberId))
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

        try {
          await ctx.db.insert(activityLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            leadId: input.leadId,
            action: "email_drafted",
            details: { leadId: input.leadId, subject: input.subject },
          });
        } catch (e) {
          console.warn("[activity] Failed to log email_drafted:", e);
        }

        return row;
      }),

    // ──────────────────────────────────────────────
    // Send — actually deliver the email via Resend
    // ──────────────────────────────────────────────
    send: protectedProcedure
      .input(
        z.object({
          emailId: z.string().uuid(),
          attachProposalPdf: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // 1. Load email record
        const [emailRecord] = await ctx.db
          .select()
          .from(outreachEmails)
          .where(
            and(
              eq(outreachEmails.id, input.emailId),
              eq(outreachEmails.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);

        if (!emailRecord) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
        }
        if (emailRecord.status === "sent") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Email has already been sent",
          });
        }

        // 2. Load lead (for merge-field rendering)
        const [lead] = await ctx.db
          .select()
          .from(leads)
          .where(eq(leads.id, emailRecord.leadId))
          .limit(1);

        if (!lead) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        }

        // 3. Render merge fields
        const renderMergeFields = (template: string): string => {
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
        };

        const renderedSubject = renderMergeFields(emailRecord.subject);
        // Convert plain-text body to simple HTML (newlines → <br>)
        const renderedBody = renderMergeFields(emailRecord.body);
        const html = renderedBody.includes("<")
          ? renderedBody
          : `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">${renderedBody.replaceAll("\n", "<br>")}</div>`;

        // 4. Build attachments if requested
        const attachments: Array<{ filename: string; content: string }> = [];
        if (input.attachProposalPdf) {
          const [pdfRow] = await ctx.db
            .select({ pdfBytes: pitchPages.pdfBytes })
            .from(pitchPages)
            .where(
              and(
                eq(pitchPages.leadId, emailRecord.leadId),
                eq(pitchPages.workspaceId, ctx.workspaceId),
              ),
            )
            .orderBy(desc(pitchPages.createdAt))
            .limit(1);

          if (pdfRow?.pdfBytes) {
            const safeName = (lead.name ?? "proposal").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
            attachments.push({
              filename: `${safeName}-proposal.pdf`,
              content: Buffer.from(pdfRow.pdfBytes).toString("base64"),
            });
          }
        }

        // 5. Send via Resend
        const { messageId } = await sendEmail({
          to: emailRecord.toEmail,
          subject: renderedSubject,
          html,
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        // 6. Update email record
        const now = new Date();
        await ctx.db
          .update(outreachEmails)
          .set({
            status: "sent",
            sentAt: now,
            providerMessageId: messageId,
          })
          .where(eq(outreachEmails.id, input.emailId));

        // 7. Update lead's last-contacted timestamp + bump status
        await ctx.db
          .update(leads)
          .set({
            lastContactedAt: now,
            updatedAt: now,
            status: lead.status === "new" ? "contacted" : lead.status,
          })
          .where(eq(leads.id, emailRecord.leadId));

        // 8. Log activity
        try {
          await ctx.db.insert(activityLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            leadId: emailRecord.leadId,
            action: "email_sent",
            details: {
              emailId: input.emailId,
              toEmail: emailRecord.toEmail,
              messageId,
              attachedProposal: attachments.length > 0,
            },
          });
        } catch (e) {
          console.warn("[activity] Failed to log email_sent:", e);
        }

        return { sent: true, messageId, attachedProposal: attachments.length > 0 };
      }),

    /**
     * Mark an email (and its lead) as replied. Used manually from the UI
     * when a prospect responds — also auto-stops any in-progress sequence
     * enrollment for that lead.
     */
    markReplied: protectedProcedure
      .input(
        z.object({
          emailId: z.string().uuid().optional(),
          leadId: z.string().uuid().optional(),
        }).refine((v) => v.emailId || v.leadId, {
          message: "Provide emailId or leadId",
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const now = new Date();

        // Resolve target: most recent sent email for this lead if only leadId given
        let targetEmailId = input.emailId;
        let leadId = input.leadId;

        if (!targetEmailId && leadId) {
          const [row] = await ctx.db
            .select({ id: outreachEmails.id })
            .from(outreachEmails)
            .where(
              and(
                eq(outreachEmails.leadId, leadId),
                eq(outreachEmails.workspaceId, ctx.workspaceId),
              ),
            )
            .orderBy(desc(outreachEmails.sentAt))
            .limit(1);
          targetEmailId = row?.id;
        }

        if (targetEmailId) {
          const [updated] = await ctx.db
            .update(outreachEmails)
            .set({ status: "replied", repliedAt: now })
            .where(
              and(
                eq(outreachEmails.id, targetEmailId),
                eq(outreachEmails.workspaceId, ctx.workspaceId),
              ),
            )
            .returning();
          if (updated) leadId = updated.leadId;
        }

        if (!leadId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No matching email/lead found",
          });
        }

        // Update lead status → converted? No, "contacted" is too weak. Use proposal
        // if not already further along, preserve converted/rejected.
        const [lead] = await ctx.db
          .select()
          .from(leads)
          .where(
            and(
              eq(leads.id, leadId),
              eq(leads.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);

        if (lead && lead.status !== "converted" && lead.status !== "rejected") {
          await ctx.db
            .update(leads)
            .set({ status: "proposal", updatedAt: now })
            .where(eq(leads.id, leadId));
        }

        // Auto-stop any active sequence enrollment for this lead
        try {
          await ctx.db.execute(
            sql`UPDATE sequence_enrollments
                SET status = 'stopped_replied', updated_at = NOW()
                WHERE lead_id = ${leadId}
                  AND workspace_id = ${ctx.workspaceId}
                  AND status = 'active'`,
          );
        } catch (e) {
          // Table may not exist yet (before migration) — non-fatal
        }

        // Log activity
        try {
          await ctx.db.insert(activityLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            leadId,
            action: "lead_replied",
            details: { emailId: targetEmailId },
          });
        } catch (e) {
          console.warn("[activity] Failed to log lead_replied:", e);
        }

        return { replied: true, leadId, emailId: targetEmailId };
      }),
  }),

  // ──────────────────────────────────────────────
  // ACTIVITY
  // ──────────────────────────────────────────────

  activity: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db
        .select({
          id: activityLog.id,
          action: activityLog.action,
          details: activityLog.details,
          createdAt: activityLog.createdAt,
          leadId: activityLog.leadId,
          userName: users.name,
        })
        .from(activityLog)
        .leftJoin(users, eq(activityLog.userId, users.id))
        .where(eq(activityLog.workspaceId, ctx.workspaceId))
        .orderBy(desc(activityLog.createdAt))
        .limit(20);

      return rows;
    }),

    log: protectedProcedure
      .input(
        z.object({
          action: z.string().min(1).max(100),
          details: z.record(z.unknown()).optional(),
          leadId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [row] = await ctx.db
          .insert(activityLog)
          .values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: input.action,
            details: input.details ?? {},
            leadId: input.leadId,
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

  // ──────────────────────────────────────────────
  // AI EMAIL DRAFTING
  // ──────────────────────────────────────────────

  aiDraft: protectedProcedure
    .input(
      z.object({
        leadId: z.string().uuid(),
        templateId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch lead
      const [lead] = await ctx.db
        .select()
        .from(leads)
        .where(
          and(eq(leads.id, input.leadId), eq(leads.workspaceId, ctx.workspaceId)),
        )
        .limit(1);

      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });

      // Fetch latest analysis for pain points
      const [analysis] = await ctx.db
        .select()
        .from(reviewAnalyses)
        .where(eq(reviewAnalyses.leadId, input.leadId))
        .orderBy(desc(reviewAnalyses.createdAt))
        .limit(1);

      const painPoints = [
        ...((analysis?.weaknesses as string[]) ?? []),
        ...((analysis?.opportunities as string[]) ?? []),
      ];

      // Fetch template if specified
      let templateHint: { subject: string; body: string } | undefined;
      if (input.templateId) {
        const [tmpl] = await ctx.db
          .select({ subject: emailTemplates.subject, body: emailTemplates.body })
          .from(emailTemplates)
          .where(eq(emailTemplates.id, input.templateId))
          .limit(1);
        if (tmpl) templateHint = tmpl;
      }

      // Fetch workspace service description
      const [ws] = await ctx.db
        .select({ settings: workspaces.settings })
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspaceId))
        .limit(1);

      const serviceDesc = (ws?.settings as any)?.serviceDescription ?? "";

      // Generate draft
      const draft = await draftEmail(
        {
          name: lead.name,
          category: lead.category ?? "",
          suburb: lead.suburb ?? "",
          state: lead.state ?? "",
          rating: String(lead.rating ?? "0"),
          reviewCount: lead.reviewCount ?? 0,
          painPoints,
          website: lead.website,
        },
        serviceDesc,
        templateHint,
      );

      return draft;
    }),

  // ──────────────────────────────────────────────
  // PITCH PAGES
  // ──────────────────────────────────────────────

  pitchPages: createTRPCRouter({
    generate: protectedProcedure
      .input(z.object({ leadId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        // Fetch lead
        const [lead] = await ctx.db
          .select()
          .from(leads)
          .where(
            and(eq(leads.id, input.leadId), eq(leads.workspaceId, ctx.workspaceId)),
          )
          .limit(1);

        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });

        // Fetch analysis
        const [analysis] = await ctx.db
          .select()
          .from(reviewAnalyses)
          .where(eq(reviewAnalyses.leadId, input.leadId))
          .orderBy(desc(reviewAnalyses.createdAt))
          .limit(1);

        // Fetch workspace for service description + sender name
        const [ws] = await ctx.db
          .select({ settings: workspaces.settings, name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, ctx.workspaceId))
          .limit(1);

        // Fetch user name
        const [user] = await ctx.db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, ctx.userId))
          .limit(1);

        const serviceDesc = (ws?.settings as any)?.serviceDescription ?? "";
        const senderName = user?.name ?? ws?.name ?? "RECON";

        // Generate pitch page HTML
        const result = await generatePitchPage({
          leadName: lead.name,
          category: lead.category ?? "",
          suburb: lead.suburb ?? "",
          state: lead.state ?? "",
          rating: String(lead.rating ?? "0"),
          reviewCount: lead.reviewCount ?? 0,
          painPoints: (analysis?.weaknesses as string[]) ?? [],
          strengths: (analysis?.strengths as string[]) ?? [],
          opportunities: (analysis?.opportunities as string[]) ?? [],
          serviceDescription: serviceDesc,
          senderName,
        });

        // Generate URL slug
        const slug =
          lead.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") +
          "-" +
          Date.now().toString(36);

        // Generate PDF version in parallel (server-side with @react-pdf/renderer)
        let pdfBytes: Buffer | undefined;
        try {
          pdfBytes = await generateProposalPdf({
            leadName: lead.name,
            category: lead.category ?? "",
            suburb: lead.suburb ?? "",
            state: lead.state ?? "",
            rating: String(lead.rating ?? "0"),
            reviewCount: lead.reviewCount ?? 0,
            painPoints: (analysis?.weaknesses as string[]) ?? [],
            strengths: (analysis?.strengths as string[]) ?? [],
            opportunities: (analysis?.opportunities as string[]) ?? [],
            serviceDescription: serviceDesc,
            senderName,
          });
        } catch (err) {
          console.warn("[pitchPages] PDF generation failed, falling back to HTML only:", err);
        }

        // Store in database
        const [page] = await ctx.db
          .insert(pitchPages)
          .values({
            leadId: input.leadId,
            workspaceId: ctx.workspaceId,
            html: result.html,
            urlSlug: slug,
            modelUsed: result.model,
            costCents: String(result.costCents),
            pdfBytes: pdfBytes,
          })
          .returning();

        return {
          id: page!.id,
          slug,
          url: `/api/pitch/${slug}`,
          pdfUrl: pdfBytes ? `/api/pitch/${slug}/pdf` : null,
          hasPdf: !!pdfBytes,
          model: result.model,
          costCents: result.costCents,
        };
      }),

    getByLead: protectedProcedure
      .input(z.object({ leadId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return ctx.db
          .select({
            id: pitchPages.id,
            urlSlug: pitchPages.urlSlug,
            modelUsed: pitchPages.modelUsed,
            createdAt: pitchPages.createdAt,
          })
          .from(pitchPages)
          .where(
            and(
              eq(pitchPages.leadId, input.leadId),
              eq(pitchPages.workspaceId, ctx.workspaceId),
            ),
          )
          .orderBy(desc(pitchPages.createdAt));
      }),
  }),

  // ──────────────────────────────────────────────
  // SEARCH STATUS (for polling)
  // ──────────────────────────────────────────────

  // ──────────────────────────────────────────────
  // Manual lead analysis (for leads skipped during scraping)
  // ──────────────────────────────────────────────

  analyseLead: protectedProcedure
    .input(z.object({ leadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await analyseLead(ctx.db, input.leadId, ctx.workspaceId);
      return result;
    }),

  // ──────────────────────────────────────────────
  // DEEP ANALYSE — fetch 20 reviews from Outscraper + AI pain point extraction
  // ──────────────────────────────────────────────

  deepAnalyse: protectedProcedure
    .input(z.object({ leadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Load lead
      const [lead] = await ctx.db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.id, input.leadId),
            eq(leads.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1);

      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
      if (!lead.googlePlaceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Lead has no Google Place ID — cannot fetch reviews",
        });
      }

      // 2. Fetch reviews from Outscraper (top 20 newest)
      const outscraperReviews = await fetchReviews(lead.googlePlaceId, 20);
      console.log("[deepAnalyse] Fetched", outscraperReviews.length, "reviews for", lead.name);

      // 3. Upsert reviews into DB (dedupe by outscraperId)
      let insertedCount = 0;
      for (const r of outscraperReviews) {
        if (!r.review_id) continue;

        // Check if review already exists
        const existing = await ctx.db
          .select({ id: reviews.id })
          .from(reviews)
          .where(
            and(
              eq(reviews.leadId, lead.id),
              eq(reviews.outscraperId, r.review_id),
            ),
          )
          .limit(1);

        if (existing.length > 0) continue;

        await ctx.db.insert(reviews).values({
          leadId: lead.id,
          workspaceId: ctx.workspaceId,
          author: r.author_title ?? null,
          rating: r.review_rating ?? null,
          text: r.review_text ?? null,
          ownerReply: r.owner_answer ?? null,
          publishedAt: r.review_datetime_utc ? new Date(r.review_datetime_utc) : null,
          outscraperId: r.review_id,
        });
        insertedCount++;
      }

      // 4. Run AI analysis on the (now-populated) reviews
      const analysis = await analyseLead(ctx.db, lead.id, ctx.workspaceId);

      // 5. Recompute opportunity score with real pain points
      const painPointCount = (analysis?.weaknesses.length ?? 0) + (analysis?.opportunities.length ?? 0);
      const newScore = computeOpportunityScore({
        hasWebsite: !!lead.website,
        hasEmail: !!lead.email,
        rating: lead.rating ? Number(lead.rating) : 0,
        reviewCount: lead.reviewCount ?? 0,
        painPointCount,
      });

      await ctx.db
        .update(leads)
        .set({ opportunityScore: newScore, updatedAt: new Date() })
        .where(eq(leads.id, lead.id));

      // 6. Log activity (best-effort)
      try {
        await ctx.db.insert(activityLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          leadId: lead.id,
          action: "deep_analysed",
          details: {
            leadName: lead.name,
            reviewsFetched: outscraperReviews.length,
            reviewsInserted: insertedCount,
            painPointCount,
            newOpportunityScore: newScore,
          },
        });
      } catch (e) {
        console.warn("[activity] Failed to log deep_analysed:", e);
      }

      return {
        reviewsFetched: outscraperReviews.length,
        reviewsInserted: insertedCount,
        painPointCount,
        newOpportunityScore: newScore,
        analysis,
      };
    }),

  // ──────────────────────────────────────────────
  // BULK OPERATIONS — apply actions to multiple selected leads
  // ──────────────────────────────────────────────

  bulkDeepAnalyse: protectedProcedure
    .input(
      z.object({
        leadIds: z.array(z.string().uuid()).min(1).max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        leadId: string;
        ok: boolean;
        error?: string;
        painPointCount?: number;
        newOpportunityScore?: number;
      }> = [];

      for (const leadId of input.leadIds) {
        try {
          const [lead] = await ctx.db
            .select()
            .from(leads)
            .where(
              and(
                eq(leads.id, leadId),
                eq(leads.workspaceId, ctx.workspaceId),
              ),
            )
            .limit(1);

          if (!lead || !lead.googlePlaceId) {
            results.push({ leadId, ok: false, error: "No Google Place ID" });
            continue;
          }

          // Fetch reviews (top 20)
          const outscraperReviews = await fetchReviews(lead.googlePlaceId, 20);

          // Upsert reviews
          for (const r of outscraperReviews) {
            if (!r.review_id) continue;
            const existing = await ctx.db
              .select({ id: reviews.id })
              .from(reviews)
              .where(
                and(
                  eq(reviews.leadId, lead.id),
                  eq(reviews.outscraperId, r.review_id),
                ),
              )
              .limit(1);
            if (existing.length > 0) continue;

            await ctx.db.insert(reviews).values({
              leadId: lead.id,
              workspaceId: ctx.workspaceId,
              author: r.author_title ?? null,
              rating: r.review_rating ?? null,
              text: r.review_text ?? null,
              ownerReply: r.owner_answer ?? null,
              publishedAt: r.review_datetime_utc
                ? new Date(r.review_datetime_utc)
                : null,
              outscraperId: r.review_id,
            });
          }

          // Run AI analysis
          const analysis = await analyseLead(ctx.db, lead.id, ctx.workspaceId);

          // Recompute opportunity score
          const painPointCount =
            (analysis?.weaknesses.length ?? 0) +
            (analysis?.opportunities.length ?? 0);
          const newScore = computeOpportunityScore({
            hasWebsite: !!lead.website,
            hasEmail: !!lead.email,
            rating: lead.rating ? Number(lead.rating) : 0,
            reviewCount: lead.reviewCount ?? 0,
            painPointCount,
          });

          await ctx.db
            .update(leads)
            .set({ opportunityScore: newScore, updatedAt: new Date() })
            .where(eq(leads.id, lead.id));

          results.push({
            leadId,
            ok: true,
            painPointCount,
            newOpportunityScore: newScore,
          });
        } catch (err) {
          results.push({
            leadId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const succeeded = results.filter((r) => r.ok).length;

      try {
        await ctx.db.insert(activityLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "bulk_deep_analysed",
          details: { count: input.leadIds.length, succeeded },
        });
      } catch (e) {
        console.warn("[activity] Failed to log bulk_deep_analysed:", e);
      }

      return { total: input.leadIds.length, succeeded, results };
    }),

  bulkSend: protectedProcedure
    .input(
      z.object({
        leadIds: z.array(z.string().uuid()).min(1).max(20),
        templateId: z.string().uuid().optional(),
        attachProposalPdf: z.boolean().default(false),
        /** Delay between sends in ms (anti-spam). Default 2s. */
        sendDelayMs: z.number().min(0).max(10000).default(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        leadId: string;
        leadName?: string;
        ok: boolean;
        error?: string;
        messageId?: string;
      }> = [];

      // Load workspace service description once
      const [ws] = await ctx.db
        .select({ settings: workspaces.settings })
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspaceId))
        .limit(1);
      const serviceDesc = (ws?.settings as any)?.serviceDescription ?? "";

      // Load template once if specified
      let templateHint: { subject: string; body: string } | undefined;
      if (input.templateId) {
        const [tmpl] = await ctx.db
          .select({ subject: emailTemplates.subject, body: emailTemplates.body })
          .from(emailTemplates)
          .where(eq(emailTemplates.id, input.templateId))
          .limit(1);
        if (tmpl) templateHint = tmpl;
      }

      for (let i = 0; i < input.leadIds.length; i++) {
        const leadId = input.leadIds[i]!;
        try {
          const [lead] = await ctx.db
            .select()
            .from(leads)
            .where(
              and(
                eq(leads.id, leadId),
                eq(leads.workspaceId, ctx.workspaceId),
              ),
            )
            .limit(1);

          if (!lead) {
            results.push({ leadId, ok: false, error: "Lead not found" });
            continue;
          }
          if (!lead.email) {
            results.push({ leadId, leadName: lead.name, ok: false, error: "No email address" });
            continue;
          }

          // Fetch latest pain points for personalisation
          const [analysis] = await ctx.db
            .select()
            .from(reviewAnalyses)
            .where(eq(reviewAnalyses.leadId, leadId))
            .orderBy(desc(reviewAnalyses.createdAt))
            .limit(1);

          const painPoints = [
            ...((analysis?.weaknesses as string[]) ?? []),
            ...((analysis?.opportunities as string[]) ?? []),
          ];

          // AI-generate personalised email for this lead
          const draft = await draftEmail(
            {
              name: lead.name,
              category: lead.category ?? "",
              suburb: lead.suburb ?? "",
              state: lead.state ?? "",
              rating: String(lead.rating ?? "0"),
              reviewCount: lead.reviewCount ?? 0,
              painPoints,
              website: lead.website,
            },
            serviceDesc,
            templateHint,
          );

          // Create email record + send via Resend
          const [emailRecord] = await ctx.db
            .insert(outreachEmails)
            .values({
              leadId,
              workspaceId: ctx.workspaceId,
              subject: draft.subject,
              body: draft.body,
              toEmail: lead.email,
              status: "queued",
            })
            .returning();

          // Build attachments if requested
          const attachments: Array<{ filename: string; content: string }> = [];
          if (input.attachProposalPdf) {
            const [pdfRow] = await ctx.db
              .select({ pdfBytes: pitchPages.pdfBytes })
              .from(pitchPages)
              .where(
                and(
                  eq(pitchPages.leadId, leadId),
                  eq(pitchPages.workspaceId, ctx.workspaceId),
                ),
              )
              .orderBy(desc(pitchPages.createdAt))
              .limit(1);

            if (pdfRow?.pdfBytes) {
              const safeName = lead.name
                .replace(/[^a-z0-9]+/gi, "-")
                .toLowerCase();
              attachments.push({
                filename: `${safeName}-proposal.pdf`,
                content: Buffer.from(pdfRow.pdfBytes).toString("base64"),
              });
            }
          }

          // Convert body to HTML if plain text
          const html = draft.body.includes("<")
            ? draft.body
            : `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">${draft.body.replaceAll("\n", "<br>")}</div>`;

          const { messageId } = await sendEmail({
            to: lead.email,
            subject: draft.subject,
            html,
            attachments: attachments.length > 0 ? attachments : undefined,
          });

          // Mark email as sent
          const now = new Date();
          await ctx.db
            .update(outreachEmails)
            .set({ status: "sent", sentAt: now, providerMessageId: messageId })
            .where(eq(outreachEmails.id, emailRecord!.id));

          // Bump lead status
          await ctx.db
            .update(leads)
            .set({
              lastContactedAt: now,
              updatedAt: now,
              status: lead.status === "new" ? "contacted" : lead.status,
            })
            .where(eq(leads.id, leadId));

          results.push({
            leadId,
            leadName: lead.name,
            ok: true,
            messageId,
          });

          // Anti-spam: wait between sends (except for last one)
          if (i < input.leadIds.length - 1 && input.sendDelayMs > 0) {
            await new Promise((r) => setTimeout(r, input.sendDelayMs));
          }
        } catch (err) {
          results.push({
            leadId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const succeeded = results.filter((r) => r.ok).length;

      try {
        await ctx.db.insert(activityLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "bulk_email_sent",
          details: {
            total: input.leadIds.length,
            succeeded,
            attachedProposal: input.attachProposalPdf,
          },
        });
      } catch (e) {
        console.warn("[activity] Failed to log bulk_email_sent:", e);
      }

      return { total: input.leadIds.length, succeeded, results };
    }),

  searchStatus: protectedProcedure
    .input(z.object({ searchId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [search] = await ctx.db
        .select({
          id: searches.id,
          status: searches.status,
          resultCount: searches.resultCount,
          query: searches.query,
          location: searches.location,
          completedAt: searches.completedAt,
        })
        .from(searches)
        .where(
          and(
            eq(searches.id, input.searchId),
            eq(searches.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1);

      return search ?? null;
    }),
});
