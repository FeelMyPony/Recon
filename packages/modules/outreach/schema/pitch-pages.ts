import { pgTable, text, timestamp, uuid, index, unique } from "drizzle-orm/pg-core";
import { workspaces } from "../../shared/schema/workspaces";
import { leads } from "./leads";

/**
 * Pitch pages: AI-generated personalised proposal pages for leads.
 * Each page is served publicly via /api/pitch/[slug].
 */
export const pitchPages = pgTable(
  "pitch_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    html: text("html").notNull(),
    urlSlug: text("url_slug").notNull(),
    modelUsed: text("model_used"),
    costCents: text("cost_cents").default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_pitch_pages_slug").on(table.urlSlug),
    index("idx_pitch_pages_lead").on(table.leadId),
    index("idx_pitch_pages_workspace").on(table.workspaceId),
  ],
);
