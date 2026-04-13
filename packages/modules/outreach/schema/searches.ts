import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../shared/schema/workspaces";

export const searchStatusEnum = pgEnum("search_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

/**
 * Searches: history of scrape jobs run via Outscraper.
 * Tracks query, location, result count, cost, and async polling state.
 */
export const searches = pgTable(
  "searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    query: text("query").notNull(), // e.g., "physiotherapist"
    location: text("location").notNull(), // e.g., "Melbourne VIC"
    filters: jsonb("filters").default({}),
    resultCount: integer("result_count").default(0),
    costCents: integer("cost_cents").default(0), // Track Outscraper cost
    status: searchStatusEnum("status").default("pending"),
    outscraperRequestId: text("outscraper_request_id"), // For async polling
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("idx_searches_workspace").on(table.workspaceId)],
);
