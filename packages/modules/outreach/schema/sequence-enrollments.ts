import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  index,
  unique,
  pgEnum,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../shared/schema/workspaces";
import { leads } from "./leads";
import { sequences } from "./sequences";

export const enrollmentStatusEnum = pgEnum("sequence_enrollment_status", [
  "active",
  "completed",
  "stopped_replied",
  "stopped_bounced",
  "stopped_manual",
]);

/**
 * Tracks a lead's progression through a sequence.
 * One row per (lead, sequence) — a lead can be re-enrolled after completion.
 */
export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** 0-indexed: next step to send (pointer into sequence_steps by step_number) */
    currentStep: integer("current_step").default(0).notNull(),
    status: enrollmentStatusEnum("status").default("active").notNull(),
    /** When the next step is eligible to fire — cron checks <= NOW() */
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_seq_enroll_lead_sequence").on(table.leadId, table.sequenceId),
    index("idx_seq_enroll_workspace").on(table.workspaceId),
    index("idx_seq_enroll_next_send").on(table.status, table.nextSendAt),
  ],
);
