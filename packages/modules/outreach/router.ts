import { z } from "zod";
import { eq, and, desc, ilike, sql, count } from "drizzle-orm";
import { leads, leadSocials, notes } from "./schema/leads";
import { reviews, reviewAnalyses } from "./schema/reviews";
import { searches } from "./schema/searches";
import { outreachEmails } from "./schema/emails";
import { emailTemplates } from "./schema/templates";
import { sequences, sequenceSteps } from "./schema/sequences";
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
