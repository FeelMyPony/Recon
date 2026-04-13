import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../shared/schema/workspaces";
import { leads, leadScoreEnum } from "./leads";

/**
 * Reviews: cached Google reviews from Outscraper.
 * workspace_id denormalized for efficient workspace-scoped queries.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    author: text("author"),
    rating: integer("rating"),
    text: text("text"),
    ownerReply: text("owner_reply"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    outscraperId: text("outscraper_id"), // For dedup on refresh
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_reviews_lead").on(table.leadId),
    index("idx_reviews_workspace").on(table.workspaceId),
  ],
);

/**
 * Review analyses: AI-generated analysis of a lead's reviews.
 * Contains sentiment, strengths, weaknesses, opportunities, and AI score.
 */
export const reviewAnalyses = pgTable(
  "review_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }),
    strengths: jsonb("strengths").default([]).$type<string[]>(),
    weaknesses: jsonb("weaknesses").default([]).$type<string[]>(),
    opportunities: jsonb("opportunities").default([]).$type<string[]>(),
    summary: text("summary"),
    aiScore: leadScoreEnum("ai_score").default("unscored"),
    aiRationale: text("ai_rationale"),
    modelUsed: text("model_used").default("claude-sonnet-4-20250514"),
    tokenCostCents: integer("token_cost_cents").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_review_analyses_lead").on(table.leadId),
    index("idx_review_analyses_workspace").on(table.workspaceId),
  ],
);
