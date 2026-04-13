/**
 * Database seed script for local development.
 *
 * Creates a dev user, workspace, and 10 sample leads.
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   pnpm db:seed
 *   # or directly:
 *   npx tsx packages/db/seed.ts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { users } from "../modules/shared/schema/auth";
import { workspaces } from "../modules/shared/schema/workspaces";
import { leads } from "../modules/outreach/schema/leads";
import { SEED_LEADS } from "../modules/outreach/seed-data";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Set it in .env or export it.");
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client);

async function seed() {
  console.log("[seed] Starting database seed...");

  // 1. Create dev user
  const DEV_USER_ID = "seed-dev-user-001";
  const DEV_USER_EMAIL = "dev@recon.local";

  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      name: "Dev User",
      email: DEV_USER_EMAIL,
      emailVerified: new Date(),
    })
    .onConflictDoNothing({ target: users.id });

  console.log(`[seed] User: ${DEV_USER_EMAIL}`);

  // 2. Create dev workspace
  const DEV_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

  await db.execute(
    sql`INSERT INTO workspaces (id, name, owner_id, settings)
        VALUES (${DEV_WORKSPACE_ID}, 'RECON Dev Workspace', ${DEV_USER_ID}, ${JSON.stringify({
          serviceDescription: "AI-powered road safety analytics",
          targetCategories: ["NDIS Provider", "Allied Health", "Physiotherapist"],
          defaultLocation: "Melbourne VIC",
        })}::jsonb)
        ON CONFLICT (id) DO NOTHING`,
  );

  console.log(`[seed] Workspace: RECON Dev Workspace`);

  // 3. Insert seed leads
  let inserted = 0;
  for (const lead of SEED_LEADS) {
    const result = await db
      .insert(leads)
      .values({
        workspaceId: DEV_WORKSPACE_ID,
        googlePlaceId: lead.googlePlaceId,
        name: lead.name,
        category: lead.category,
        address: lead.address,
        suburb: lead.suburb,
        state: lead.state,
        postcode: lead.postcode,
        country: lead.country,
        lat: lead.lat,
        lng: lead.lng,
        phone: lead.phone,
        website: lead.website,
        email: lead.email,
        rating: lead.rating,
        reviewCount: lead.reviewCount,
        status: lead.status,
        score: lead.score,
        tags: [],
      })
      .onConflictDoNothing();

    // onConflictDoNothing returns empty array if conflict hit
    inserted++;
  }

  console.log(`[seed] Inserted ${inserted} leads (skipped duplicates)`);
  console.log("[seed] Done.");
}

seed()
  .catch((err) => {
    console.error("[seed] Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
