/**
 * Scraper service — calls Outscraper API and upserts leads into the database.
 * Extracted from workers/scraper/handler.ts for in-process use via tRPC.
 */

import { eq, and } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { searches } from "../schema/searches";
import { leads } from "../schema/leads";

interface OutscraperPlace {
  name: string;
  place_id: string;
  full_address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  site?: string;
  subtypes?: string[];
  rating?: number;
  reviews?: number;
  working_hours?: string[];
  emails_and_contacts?: Array<{ email: string }>;
}

/**
 * Run a full scrape job: call Outscraper, upsert leads, update search status.
 * Returns the IDs of newly created leads.
 */
export async function scrapeSearch(
  db: PostgresJsDatabase,
  searchId: string,
  workspaceId: string,
): Promise<{ newLeadIds: string[]; updatedCount: number; totalPlaces: number }> {
  // 1. Fetch search record
  const [search] = await db
    .select()
    .from(searches)
    .where(and(eq(searches.id, searchId), eq(searches.workspaceId, workspaceId)))
    .limit(1);

  if (!search) throw new Error(`Search ${searchId} not found`);

  // Mark as running
  await db.update(searches).set({ status: "running" }).where(eq(searches.id, searchId));

  try {
    // 2. Call Outscraper
    const places = await callOutscraper(search.query, search.location);
    console.log("[scraper] Outscraper returned", places.length, "places");

    // 3. Upsert leads
    const newLeadIds: string[] = [];
    let updatedCount = 0;

    for (const place of places) {
      if (!place.place_id) continue;

      const leadData = parsePlace(place, workspaceId, searchId);

      // Check if exists
      const [existing] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.workspaceId, workspaceId),
            eq(leads.googlePlaceId, place.place_id),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(leads)
          .set({
            ...leadData,
            updatedAt: new Date(),
            // Don't overwrite status/score if already set
            status: undefined,
            score: undefined,
          })
          .where(eq(leads.id, existing.id));
        updatedCount++;
      } else {
        const [newLead] = await db
          .insert(leads)
          .values(leadData as any)
          .returning({ id: leads.id });
        if (newLead) newLeadIds.push(newLead.id);
      }
    }

    // 4. Update search status
    await db
      .update(searches)
      .set({
        status: "completed",
        resultCount: places.length,
        completedAt: new Date(),
      })
      .where(eq(searches.id, searchId));

    console.log("[scraper] Done:", newLeadIds.length, "new,", updatedCount, "updated");
    return { newLeadIds, updatedCount, totalPlaces: places.length };
  } catch (err) {
    // Mark search as failed
    await db
      .update(searches)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(searches.id, searchId));
    throw err;
  }
}

// ─── Outscraper API ────────────────────────────────────────────────────

async function callOutscraper(
  query: string,
  location: string,
  limit = 50,
): Promise<OutscraperPlace[]> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) throw new Error("OUTSCRAPER_API_KEY is required");

  const searchQuery = `${query} in ${location}`;
  console.log("[scraper] Calling Outscraper:", searchQuery);

  const response = await fetch("https://api.outscraper.com/maps/search-v3", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ query: searchQuery, limit, async: false }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Outscraper API ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Invalid Outscraper response format");
  }

  return data[0];
}

// ─── Place → Lead parsing ──────────────────────────────────────────────

function parsePlace(
  place: OutscraperPlace,
  workspaceId: string,
  sourceSearchId: string,
) {
  return {
    workspaceId,
    googlePlaceId: place.place_id,
    name: place.name,
    category: place.subtypes?.[0] ?? "Local Business",
    address: place.full_address,
    suburb: place.city,
    state: place.state,
    postcode: place.postal_code,
    country: place.country_code ?? "AU",
    lat: place.latitude,
    lng: place.longitude,
    phone: place.phone,
    website: place.site,
    email: place.emails_and_contacts?.[0]?.email,
    rating: place.rating ? String(place.rating) : undefined,
    reviewCount: place.reviews ?? 0,
    googleMapsUrl: place.place_id
      ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
      : undefined,
    openingHours: place.working_hours ? { hours: place.working_hours } : undefined,
    sourceSearchId,
    status: "new" as const,
    score: "unscored" as const,
  };
}
