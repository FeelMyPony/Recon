/**
 * Workspace members: multi-user access within a workspace.
 * Supports invite-before-accept flow (invited_email set, user_id null until accepted).
 *
 * ── SQL Migration ──────────────────────────────────────────────────────
 * -- Run this against your database to create the table:
 *
 * CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member', 'viewer');
 *
 * CREATE TABLE workspace_members (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 *   user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
 *   role workspace_role NOT NULL DEFAULT 'member',
 *   invited_email TEXT,
 *   invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   accepted_at TIMESTAMPTZ,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   UNIQUE (workspace_id, user_id),
 *   UNIQUE (workspace_id, invited_email)
 * );
 *
 * CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
 * CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
 * ───────────────────────────────────────────────────────────────────────
 */

import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

export const workspaceRoleEnum = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull().default("member"),
    invitedEmail: text("invited_email"),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_workspace_members_workspace").on(table.workspaceId),
    index("idx_workspace_members_user").on(table.userId),
    unique("uq_workspace_members_workspace_user").on(
      table.workspaceId,
      table.userId,
    ),
    unique("uq_workspace_members_workspace_email").on(
      table.workspaceId,
      table.invitedEmail,
    ),
  ],
);
