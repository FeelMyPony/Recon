import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../shared/schema/workspaces";
import { leads } from "./leads";
import { sequences } from "./sequences";

export const emailStatusEnum = pgEnum("email_status", [
  "draft",
  "queued",
  "sent",
  "opened",
  "replied",
  "bounced",
]);

/**
 * Outreach emails: individual emails sent to leads.
 * Can be standalone or part of a sequence.
 */
export const outreachEmails = pgTable(
  "outreach_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id").references(() => sequences.id),
    stepNumber: integer("step_number"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    toEmail: text("to_email").notNull(),
    status: emailStatusEnum("status").default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"), // SES message ID
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_outreach_emails_lead").on(table.leadId),
    index("idx_outreach_emails_workspace_status").on(
      table.workspaceId,
      table.status,
    ),
    index("idx_outreach_emails_lead_created").on(
      table.leadId,
      table.createdAt,
    ),
  ],
);
