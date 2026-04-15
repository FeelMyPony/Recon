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
  address?: string;
  full_address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  site?: string;
  category?: string;
  subtypes?: string | string[];
  rating?: number;
  reviews?: number;
  working_hours?: Record<string, string[]> | string[];
  emails_and_contacts?: Array<{ email: string }>;
  email_1?: string;
}

/** Post-scrape filters matching the user's search criteria */
export interface ScrapeFilters {
  /** Only keep places with rating >= this value */
  minRating?: number;
  /** Only keep places with at least this many reviews */
  minReviewCount?: number;
  /** Only keep places that do NOT have a website */
  excludeWithWebsite?: boolean;
  /** Only keep places that have an email */
  requireEmail?: boolean;
}

/**
 * Compute an opportunity score (0-100) for a lead.
 * Higher = better outreach target.
 *
 *   + up to 25 for no-website (outreach angle)
 *   + up to 25 for rating (5★ = 25)
 *   + up to 15 for review count (log scale, caps at ~50 reviews)
 *   + up to 35 for AI pain points (7 per pain point, 5 max)
 *   - 10 if no email (harder to reach)
 */
export function computeOpportunityScore(params: {
  hasWebsite: boolean;
  hasEmail: boolean;
  rating: number; // 0-5
  reviewCount: number;
  painPointCount: number; // 0-5
}): number {
  const { hasWebsite, hasEmail, rating, reviewCount, painPointCount } = params;

  let score = 0;
  score += hasWebsite ? 0 : 25;
  score += Math.min(25, Math.max(0, rating) * 5);
  score += Math.min(15, Math.log10(Math.max(0, reviewCount) + 1) * 6);
  score += Math.min(35, Math.max(0, painPointCount) * 7);
  score -= hasEmail ? 0 : 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Run a full scrape job: call Outscraper, filter + upsert leads, update search status.
 * Returns the IDs of newly created leads.
 */
export async function scrapeSearch(
  db: PostgresJsDatabase,
  searchId: string,
  workspaceId: string,
): Promise<{ newLeadIds: string[]; updatedCount: number; totalPlaces: number; filteredCount: number }> {
  // 1. Fetch search record
  const [search] = await db
    .select()
    .from(searches)
    .where(and(eq(searches.id, searchId), eq(searches.workspaceId, workspaceId)))
    .limit(1);

  if (!search) throw new Error(`Search ${searchId} not found`);

  const filters = (search.filters as ScrapeFilters) ?? {};

  // Mark as running
  await db.update(searches).set({ status: "running" }).where(eq(searches.id, searchId));

  try {
    // 2. Call Outscraper
    const allPlaces = await callOutscraper(search.query, search.location);
    console.log("[scraper] Outscraper returned", allPlaces.length, "places");

    // 3. Apply search filters (post-fetch, client-side)
    const places = allPlaces.filter((p) => {
      if (filters.minRating != null && (p.rating ?? 0) < filters.minRating) return false;
      if (filters.minReviewCount != null && (p.reviews ?? 0) < filters.minReviewCount) return false;
      if (filters.excludeWithWebsite && (p.website ?? p.site)) return false;
      if (filters.requireEmail && !(p.emails_and_contacts?.[0]?.email ?? p.email_1)) return false;
      return true;
    });
    console.log("[scraper] After filters:", places.length, "places");

    // 4. Upsert leads with initial opportunity score
    const newLeadIds: string[] = [];
    let updatedCount = 0;

    for (const place of places) {
      if (!place.place_id) continue;

      const leadData = parsePlace(place, workspaceId, searchId);

      // Compute initial opportunity score (no pain points yet — AI will update later)
      const initialScore = computeOpportunityScore({
        hasWebsite: !!(place.website ?? place.site),
        hasEmail: !!(place.emails_and_contacts?.[0]?.email ?? place.email_1),
        rating: place.rating ?? 0,
        reviewCount: place.reviews ?? 0,
        painPointCount: 0,
      });

      const leadDataWithScore = { ...leadData, opportunityScore: initialScore };

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
            ...leadDataWithScore,
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
          .values(leadDataWithScore as any)
          .returning({ id: leads.id });
        if (newLead) newLeadIds.push(newLead.id);
      }
    }

    // 5. Update search status
    await db
      .update(searches)
      .set({
        status: "completed",
        resultCount: places.length,
        completedAt: new Date(),
      })
      .where(eq(searches.id, searchId));

    console.log("[scraper] Done:", newLeadIds.length, "new,", updatedCount, "updated");
    return {
      newLeadIds,
      updatedCount,
      totalPlaces: allPlaces.length,
      filteredCount: places.length,
    };
  } catch (err) {
    await db
      .update(searches)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(searches.id, searchId));
    throw err;
  }
}

// ─── Outscraper: places search ────────────────────────────────────────

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

  const raw = await response.json();
  const data = Array.isArray(raw) ? raw : raw?.data;

  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    console.error("[scraper] Unexpected Outscraper response:", JSON.stringify(raw).slice(0, 300));
    throw new Error("Invalid Outscraper response format");
  }

  return data[0];
}

// ─── Outscraper: reviews fetch ───────────────────────────────────────

export interface OutscraperReview {
  author_title?: string;
  review_rating?: number;
  review_text?: string;
  review_id?: string;
  review_datetime_utc?: string;
  owner_answer?: string;
}

/**
 * Fetch up to `limit` Google reviews for a given place.
 * Uses Outscraper's google-maps-reviews-v3 endpoint.
 */
export async function fetchReviews(
  googlePlaceId: string,
  limit = 20,
): Promise<OutscraperReview[]> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) throw new Error("OUTSCRAPER_API_KEY is required");

  const url = new URL("https://api.outscraper.com/maps/reviews-v3");
  url.searchParams.set("query", googlePlaceId);
  url.searchParams.set("reviewsLimit", String(limit));
  url.searchParams.set("sort", "newest");
  url.searchParams.set("async", "false");

  console.log("[scraper] Fetching reviews for", googlePlaceId, "(limit", limit, ")");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-API-KEY": apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Outscraper reviews API ${response.status}: ${text.slice(0, 200)}`);
  }

  const raw = await response.json();
  const data = Array.isArray(raw) ? raw : raw?.data;
  if (!Array.isArray(data) || data.length === 0) return [];

  // data[0] is the place; its reviews_data array contains reviews
  const placeResult = data[0];
  if (Array.isArray(placeResult)) return placeResult as OutscraperReview[];
  if (placeResult && Array.isArray(placeResult.reviews_data)) {
    return placeResult.reviews_data as OutscraperReview[];
  }

  return [];
}

// ─── Place → Lead parsing ──────────────────────────────────────────────

function parsePlace(
  place: OutscraperPlace,
  workspaceId: string,
  sourceSearchId: string,
) {
  let category: string = "Local Business";
  if (place.category) {
    category = place.category;
  } else if (typeof place.subtypes === "string") {
    category = place.subtypes.split(",")[0]?.trim() ?? "Local Business";
  } else if (Array.isArray(place.subtypes) && place.subtypes.length > 0) {
    category = place.subtypes[0] ?? "Local Business";
  }

  const openingHours = place.working_hours
    ? Array.isArray(place.working_hours)
      ? { hours: place.working_hours }
      : place.working_hours
    : undefined;

  const email =
    place.emails_and_contacts?.[0]?.email ?? place.email_1 ?? undefined;

  return {
    workspaceId,
    googlePlaceId: place.place_id,
    name: place.name,
    category,
    address: place.address ?? place.full_address,
    suburb: place.city,
    state: place.state,
    postcode: place.postal_code,
    country: place.country_code ?? "AU",
    lat: place.latitude,
    lng: place.longitude,
    phone: place.phone,
    website: place.website ?? place.site,
    email,
    rating: place.rating ? String(place.rating) : undefined,
    reviewCount: place.reviews ?? 0,
    googleMapsUrl: place.place_id
      ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
      : undefined,
    openingHours,
    sourceSearchId,
    status: "new" as const,
    score: "unscored" as const,
  };
}
