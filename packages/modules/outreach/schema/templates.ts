import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../shared/schema/workspaces";

/**
 * Email templates: reusable templates for outreach campaigns.
 * Supports merge fields for personalisation (e.g., {{business_name}}, {{pain_point}}).
 */
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    mergeFields: jsonb("merge_fields").default([]).$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_email_templates_workspace").on(table.workspaceId),
  ],
);
