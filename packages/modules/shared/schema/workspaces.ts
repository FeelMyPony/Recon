import { pgTable, text, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Workspaces: multi-tenant root entity.
 * Every user owns one or more workspaces.
 * All domain data (leads, emails, etc.) belongs to a workspace.
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    settings: jsonb("settings")
      .default({})
      .$type<{
        serviceDescription?: string;
        targetCategories?: string[];
        defaultLocation?: string;
      }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_workspaces_owner").on(table.ownerId)],
);
