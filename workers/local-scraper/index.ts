/**
 * RECON local scraper + LLM worker.
 *
 * Polls the `searches` table for pending jobs, calls Outscraper within the
 * drawn geometry (same API as the existing Lambda scraper), upserts leads,
 * optionally extracts contact emails from business websites, and uses LM
 * Studio (local Gemma) to score each new lead. Runs on Stefan's Mac so
 * LLM inference costs nothing.
 *
 * Run: pnpm --filter @recon/local-scraper start
 */

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { searches } from "../../packages/modules/outreach/schema/searches.ts";
import { leads } from "../../packages/modules/outreach/schema/leads.ts";
import { config } from "./config.ts";
import {
  searchPlacesInArea,
  type Area,
  type OutscraperPlace,
} from "./outscraper.ts";
import { extractEmailFromWebsite } from "./website-scraper.ts";
import { isLmStudioReachable, scoreLead } from "./llm.ts";

// ─────────────────────────────────────────────────────────────────────────
// DB
// ─────────────────────────────────────────────────────────────────────────

const sqlClient = postgres(config.databaseUrl, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});
const db = drizzle(sqlClient);

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface PendingSearch {
  id: string;
  workspaceId: string;
  query: string;
  filters: unknown;
}

// ─────────────────────────────────────────────────────────────────────────
// Core processing
// ─────────────────────────────────────────────────────────────────────────

function parseArea(filters: unknown): Area | null {
  if (!filters || typeof filters !== "object") return null;
  const obj = filters as Record<string, unknown>;
  const area = obj.area as Area | undefined;
  if (!area) return null;
  if (area.type === "circle" || area.type === "polygon") return area;
  return null;
}

async function claimNextSearch(): Promise<PendingSearch | null> {
  // Atomic claim: find a pending search and mark it running in one statement.
  const rows = await db.execute<{
    id: string;
    workspace_id: string;
    query: string;
    filters: unknown;
  }>(sql`
    UPDATE searches
    SET status = 'running'
    WHERE id = (
      SELECT id FROM searches
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, workspace_id, query, filters
  `);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    query: row.query,
    filters: row.filters,
  };
}

async function markFailed(searchId: string, reason: string) {
  console.error(`[scraper] Search ${searchId} failed: ${reason}`);
  await db
    .update(searches)
    .set({ status: "failed", completedAt: new Date() })
    .where(eq(searches.id, searchId));
}

async function markCompleted(searchId: string, resultCount: number) {
  await db
    .update(searches)
    .set({
      status: "completed",
      resultCount,
      completedAt: new Date(),
    })
    .where(eq(searches.id, searchId));
}

function pickCategory(place: OutscraperPlace): string {
  return place.subtypes?.[0] ?? "Local Business";
}

async function upsertLead(
  workspaceId: string,
  searchId: string,
  place: OutscraperPlace,
  enrichedEmail: string | null,
): Promise<{ id: string; created: boolean } | null> {
  if (!place.place_id) return null;

  const existing = await db
    .select({ id: leads.id, email: leads.email })
    .from(leads)
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        eq(leads.googlePlaceId, place.place_id),
      ),
    )
    .limit(1);

  // Prefer Outscraper's built-in email if present, then fall back to
  // website scraping result.
  const outscraperEmail = place.emails_and_contacts?.[0]?.email ?? null;
  const email = outscraperEmail ?? enrichedEmail;

  const googleMapsUrl = place.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
    : null;

  const openingHours = place.working_hours
    ? { hours: place.working_hours }
    : null;

  const leadData = {
    workspaceId,
    googlePlaceId: place.place_id,
    name: place.name,
    category: pickCategory(place),
    address: place.full_address ?? null,
    suburb: place.city ?? null,
    state: place.state ?? null,
    postcode: place.postal_code ?? null,
    country: place.country_code ?? "AU",
    lat: place.latitude ?? null,
    lng: place.longitude ?? null,
    phone: place.phone ?? null,
    website: place.site ?? null,
    email,
    rating: place.rating != null ? String(place.rating) : null,
    reviewCount: place.reviews ?? 0,
    googleMapsUrl,
    openingHours,
    sourceSearchId: searchId,
  };

  if (existing[0]) {
    // Don't clobber a good existing email with null.
    const patch: Record<string, unknown> = { ...leadData };
    if (!email && existing[0].email) {
      patch.email = existing[0].email;
    }
    patch.updatedAt = new Date();
    await db.update(leads).set(patch).where(eq(leads.id, existing[0].id));
    return { id: existing[0].id, created: false };
  }

  const now = new Date();
  const inserted = await db
    .insert(leads)
    .values({
      ...leadData,
      status: "new" as const,
      score: "unscored" as const,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: leads.id });

  const id = inserted[0]?.id;
  if (!id) return null;
  return { id, created: true };
}

async function enrichEmail(
  place: OutscraperPlace,
): Promise<string | null> {
  // Skip if Outscraper already gave us one or the feature is off.
  if (place.emails_and_contacts?.[0]?.email) return null;
  if (!config.enableWebsiteEmailScrape) return null;
  if (!place.site) return null;
  return extractEmailFromWebsite(place.site);
}

async function processSearch(search: PendingSearch): Promise<void> {
  console.log(`[scraper] Starting search ${search.id}: "${search.query}"`);

  const area = parseArea(search.filters);
  if (!area) {
    await markFailed(search.id, "No area geometry in filters");
    return;
  }

  // 1. Query Outscraper and filter to the drawn area.
  let places: OutscraperPlace[];
  try {
    places = await searchPlacesInArea(
      search.query,
      area,
      config.maxResultsPerSearch,
    );
  } catch (err) {
    await markFailed(
      search.id,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  console.log(`[scraper] ${places.length} places after area filter`);

  // 2. Upsert leads with email enrichment + LLM scoring.
  let newCount = 0;
  let updatedCount = 0;

  for (const place of places) {
    try {
      const email = await enrichEmail(place);
      const upserted = await upsertLead(
        search.workspaceId,
        search.id,
        place,
        email,
      );
      if (!upserted) continue;

      if (upserted.created) newCount++;
      else updatedCount++;

      if (upserted.created && config.enableLlmScoring) {
        const finalEmail = place.emails_and_contacts?.[0]?.email ?? email;
        const scoring = await scoreLead({
          name: place.name,
          category: pickCategory(place),
          suburb: place.city ?? null,
          rating: place.rating ?? null,
          reviewCount: place.reviews ?? null,
          hasEmail: !!finalEmail,
          hasWebsite: !!place.site,
          hasPhone: !!place.phone,
        });

        if (scoring) {
          await db
            .update(leads)
            .set({ score: scoring.score, updatedAt: new Date() })
            .where(eq(leads.id, upserted.id));
          console.log(
            `  [${scoring.score}] ${place.name}: ${scoring.reasoning}`,
          );
        }
      }
    } catch (err) {
      console.warn(
        `[scraper] Failed to process place ${place.place_id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  await markCompleted(search.id, places.length);
  console.log(
    `[scraper] Search ${search.id} done — ${newCount} new, ${updatedCount} updated`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Polling loop
// ─────────────────────────────────────────────────────────────────────────

let shuttingDown = false;

async function pollLoop(): Promise<void> {
  while (!shuttingDown) {
    try {
      const next = await claimNextSearch();
      if (next) {
        await processSearch(next).catch((err) => {
          console.error("[scraper] Unhandled error:", err);
          return markFailed(
            next.id,
            err instanceof Error ? err.message : String(err),
          );
        });
      } else {
        await sleep(config.pollIntervalMs);
      }
    } catch (err) {
      console.error("[scraper] Poll iteration failed:", err);
      await sleep(config.pollIntervalMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[scraper] RECON local scraper starting");
  console.log(`[scraper] DB: ${config.databaseUrl.replace(/:[^:@]+@/, ":****@")}`);
  console.log(`[scraper] Poll interval: ${config.pollIntervalMs}ms`);
  console.log(`[scraper] Max results/search: ${config.maxResultsPerSearch}`);
  console.log(
    `[scraper] Email scraping: ${config.enableWebsiteEmailScrape ? "on" : "off"}`,
  );
  console.log(
    `[scraper] LLM scoring: ${config.enableLlmScoring ? "on" : "off"}`,
  );

  if (config.enableLlmScoring) {
    const ok = await isLmStudioReachable();
    if (!ok) {
      console.warn(
        `[scraper] WARNING: LM Studio not reachable at ${config.lmStudioBaseUrl}. ` +
          "Scoring will be skipped for new leads. Start LM Studio and load a model " +
          "(e.g. google/gemma-3-4b-it) to enable scoring.",
      );
    } else {
      console.log(`[scraper] LM Studio OK at ${config.lmStudioBaseUrl}`);
    }
  }

  const shutdown = async (sig: string) => {
    console.log(`[scraper] ${sig} received, shutting down`);
    shuttingDown = true;
    setTimeout(() => process.exit(0), 2000);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await pollLoop();
  await sqlClient.end();
}

main().catch((err) => {
  console.error("[scraper] Fatal error:", err);
  process.exit(1);
});
