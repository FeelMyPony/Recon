import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../shared/schema/workspaces";
import { emailTemplates } from "./templates";

/**
 * Sequences: multi-step email drip campaigns.
 */
export const sequences = pgTable(
  "sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_sequences_workspace").on(table.workspaceId)],
);

/**
 * Sequence steps: normalised from JSONB for per-step metrics + querying.
 * Each step references a template and defines a delay from the previous step.
 */
export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    templateId: uuid("template_id").references(() => emailTemplates.id),
    delayDays: integer("delay_days").default(0),
    aiGenerate: boolean("ai_generate").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_sequence_steps_sequence").on(table.sequenceId),
    index("idx_sequence_steps_workspace").on(table.workspaceId),
  ],
);
