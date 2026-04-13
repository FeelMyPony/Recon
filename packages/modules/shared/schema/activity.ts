import { pgTable, text, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

/**
 * Activity log: immutable audit trail for all workspace actions.
 * Records who did what, when, and to which lead.
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id"), // nullable, references outreach.leads but no FK to avoid cross-schema dependency
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(), // e.g., 'status_changed', 'email_sent', 'note_added', 'review_analysed'
    details: jsonb("details").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // Composite index for the most common query: workspace activity feed
    index("idx_activity_log_workspace_created").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("idx_activity_log_lead").on(table.leadId),
  ],
);
