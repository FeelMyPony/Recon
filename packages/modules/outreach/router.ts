import { z } from "zod";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
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

        return result;
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
        const [search] = await ctx.db
          .insert(searches)
          .values({
            workspaceId: ctx.workspaceId,
            query: input.query,
            location: input.location,
            filters: input.filters ?? {},
          })
          .returning();

        // TODO: Emit event to trigger Outscraper Lambda
        // await emitEvent("outreach.search.created", ctx.workspaceId, "outreach", { searchId: search.id });

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
    const allLeads = await ctx.db
      .select({
        status: leads.status,
        score: leads.score,
        email: leads.email,
      })
      .from(leads)
      .where(eq(leads.workspaceId, ctx.workspaceId));

    return {
      total: allLeads.length,
      withEmail: allLeads.filter((l) => l.email).length,
      hot: allLeads.filter((l) => l.score === "hot").length,
      warm: allLeads.filter((l) => l.score === "warm").length,
      cold: allLeads.filter((l) => l.score === "cold").length,
      byStatus: {
        new: allLeads.filter((l) => l.status === "new").length,
        qualified: allLeads.filter((l) => l.status === "qualified").length,
        contacted: allLeads.filter((l) => l.status === "contacted").length,
        proposal: allLeads.filter((l) => l.status === "proposal").length,
        converted: allLeads.filter((l) => l.status === "converted").length,
        rejected: allLeads.filter((l) => l.status === "rejected").length,
      },
    };
  }),
});
