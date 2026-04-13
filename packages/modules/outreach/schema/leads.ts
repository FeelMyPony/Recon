import {
  pgTable,
  pgSchema,
  text,
  timestamp,
  integer,
  numeric,
  doublePrecision,
  jsonb,
  uuid,
  index,
  unique,
  pgEnum,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../shared/schema/workspaces";

// Enums
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "qualified",
  "contacted",
  "proposal",
  "converted",
  "rejected",
]);

export const leadScoreEnum = pgEnum("lead_score", [
  "hot",
  "warm",
  "cold",
  "unscored",
]);

export const socialPlatformEnum = pgEnum("social_platform", [
  "facebook",
  "instagram",
  "linkedin",
  "twitter",
  "youtube",
  "tiktok",
  "whatsapp",
]);

/**
 * Leads: core business records scraped from Google Maps.
 * Each lead belongs to a workspace and optionally to a source search.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),

    // Identity
    googlePlaceId: text("google_place_id"),
    name: text("name").notNull(),
    category: text("category"),

    // Location
    address: text("address"),
    suburb: text("suburb"),
    state: text("state"),
    postcode: text("postcode"),
    country: text("country").default("AU"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    // Note: PostGIS geography column is created via raw SQL migration
    // since Drizzle doesn't natively support PostGIS types

    // Contact
    phone: text("phone"),
    website: text("website"),
    email: text("email"),

    // Google data
    rating: numeric("rating", { precision: 2, scale: 1 }),
    reviewCount: integer("review_count").default(0),
    googleMapsUrl: text("google_maps_url"),
    openingHours: jsonb("opening_hours"),

    // Pipeline
    status: leadStatusEnum("status").default("new"),
    score: leadScoreEnum("score").default("unscored"),
    tags: text("tags")
      .array()
      .default([]),

    // Tracking
    sourceSearchId: uuid("source_search_id"), // References searches table
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // Dedupe: one Google Place per workspace
    unique("uq_leads_workspace_place").on(
      table.workspaceId,
      table.googlePlaceId,
    ),
    index("idx_leads_workspace").on(table.workspaceId),
    index("idx_leads_status").on(table.workspaceId, table.status),
    index("idx_leads_score").on(table.workspaceId, table.score),
    index("idx_leads_rating").on(table.rating),
    index("idx_leads_follow_up").on(table.followUpAt),
    index("idx_leads_google_place").on(table.googlePlaceId),
  ],
);

/**
 * Lead socials: social media presence for each lead.
 * workspace_id denormalized for efficient RLS filtering.
 */
export const leadSocials = pgTable(
  "lead_socials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: socialPlatformEnum("platform").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_lead_socials_platform").on(table.leadId, table.platform),
    index("idx_lead_socials_lead").on(table.leadId),
    index("idx_lead_socials_workspace").on(table.workspaceId),
  ],
);

/**
 * Notes: user-created notes on leads.
 * workspace_id denormalized for efficient RLS filtering.
 */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_notes_lead").on(table.leadId),
    index("idx_notes_workspace").on(table.workspaceId),
  ],
);
