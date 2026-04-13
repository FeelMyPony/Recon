import type { SQSEvent, SQSHandler, SQSRecord } from "aws-lambda";
import { eq, and } from "drizzle-orm";
import { getDb } from "../../packages/db/client";
import { searches } from "../../packages/modules/outreach/schema/searches";
import { leads } from "../../packages/modules/outreach/schema/leads";
import { emitEvent, getEventBus } from "../../packages/events/bus";

/**
 * Outscraper API response shape for a single place
 */
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
 * Outscraper API response: array of arrays.
 * First element is the array of places.
 */
type OutscraperResponse = OutscraperPlace[][];

/**
 * SQS message payload from SNS envelope
 */
interface ScrapeSearchMessage {
  type: string;
  workspaceId: string;
  payload: {
    searchId: string;
  };
}

/**
 * Calls Outscraper Google Maps API (https://api.outscraper.com/maps/search-v3)
 * Returns parsed place records or throws on API error
 */
async function callOutscraperAPI(
  query: string,
  location: string,
  limit: number = 50,
): Promise<OutscraperPlace[]> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    throw new Error("OUTSCRAPER_API_KEY environment variable is required");
  }

  const searchQuery = `${query} in ${location}`;

  console.log("[scraper] Calling Outscraper API", {
    query: searchQuery,
    limit,
  });

  const response = await fetch("https://api.outscraper.com/maps/search-v3", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query: searchQuery,
      limit,
      async: false, // synchronous mode for small batches
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[scraper] Outscraper API error", {
      status: response.status,
      error: errorText,
    });
    throw new Error(
      `Outscraper API error: ${response.status} ${errorText.slice(0, 200)}`,
    );
  }

  const data: OutscraperResponse = await response.json();

  // Response is array of arrays; first element is the results
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Invalid Outscraper response format");
  }

  return data[0];
}

/**
 * Parses Outscraper place data into a lead record suitable for database insertion
 */
function parsePlace(
  place: OutscraperPlace,
  workspaceId: string,
  sourceSearchId: string,
): Partial<typeof leads.$inferInsert> {
  // Extract category from first subtype or fallback to generic category
  const category = place.subtypes?.[0] ?? "Local Business";

  // Extract email from emails_and_contacts array
  const email = place.emails_and_contacts?.[0]?.email;

  // Build Google Maps URL from place_id
  const googleMapsUrl = place.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
    : undefined;

  // Parse opening hours (Outscraper returns as string array, convert to object)
  const openingHours = place.working_hours
    ? {
        hours: place.working_hours,
      }
    : undefined;

  return {
    workspaceId,
    googlePlaceId: place.place_id,
    name: place.name,
    category,
    address: place.full_address,
    suburb: place.city,
    state: place.state,
    postcode: place.postal_code,
    country: place.country_code ?? "AU",
    lat: place.latitude,
    lng: place.longitude,
    phone: place.phone,
    website: place.site,
    email,
    rating: place.rating ? String(place.rating) : undefined,
    reviewCount: place.reviews ?? 0,
    googleMapsUrl,
    openingHours,
    sourceSearchId,
    status: "new" as const,
    score: "unscored" as const,
  };
}

/**
 * Processes a single SQS record to scrape a search and upsert leads
 * Returns true if successful, false if processing should not retry
 */
async function processScrapeSearch(record: SQSRecord): Promise<boolean> {
  const db = getDb();
  const eventBus = getEventBus();

  try {
    // Parse SNS envelope + domain event
    const body = JSON.parse(record.body);
    const message: ScrapeSearchMessage = JSON.parse(body.Message ?? body);

    const { workspaceId, payload } = message;
    const { searchId } = payload;

    console.log("[scraper] Processing search", {
      searchId,
      workspaceId,
    });

    // 1. Fetch search details from DB
    const search = await db
      .select()
      .from(searches)
      .where(
        and(eq(searches.id, searchId), eq(searches.workspaceId, workspaceId)),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!search) {
      console.error("[scraper] Search not found", { searchId, workspaceId });
      // Don't retry: search doesn't exist
      return false;
    }

    if (search.status !== "pending") {
      console.warn("[scraper] Search already processing or completed", {
        searchId,
        status: search.status,
      });
      // Don't retry: already handled
      return false;
    }

    // Mark search as running
    await db
      .update(searches)
      .set({ status: "running" })
      .where(eq(searches.id, searchId));

    // 2. Call Outscraper API
    let places: OutscraperPlace[];
    try {
      places = await callOutscraperAPI(search.query, search.location);
      console.log("[scraper] Outscraper returned results", {
        count: places.length,
        query: search.query,
      });
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      console.error("[scraper] Outscraper API call failed", {
        searchId,
        error: errorMsg,
      });

      // Update search status to failed
      await db
        .update(searches)
        .set({
          status: "failed",
          completedAt: new Date(),
        })
        .where(eq(searches.id, searchId));

      // Don't retry: API failure
      return false;
    }

    // 3. Parse results into lead records
    const leadRecords = places.map((place) =>
      parsePlace(place, workspaceId, searchId),
    );

    // 4. Upsert leads by (workspace_id, google_place_id) using onConflictDoUpdate
    const createdLeadIds = new Set<string>();
    const now = new Date();

    for (const leadRecord of leadRecords) {
      if (!leadRecord.googlePlaceId) {
        console.warn("[scraper] Skipping place without place_id", {
          name: leadRecord.name,
        });
        continue;
      }

      // Check if lead already exists
      const existing = await db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.workspaceId, workspaceId),
            eq(leads.googlePlaceId, leadRecord.googlePlaceId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (existing) {
        // Lead already exists - update it
        console.log("[scraper] Lead already exists, updating", {
          leadId: existing.id,
          name: leadRecord.name,
        });

        await db
          .update(leads)
          .set({
            ...leadRecord,
            updatedAt: now,
          })
          .where(eq(leads.id, existing.id));
      } else {
        // New lead - insert it
        const insertResult = await db
          .insert(leads)
          .values({
            ...leadRecord,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: leads.id });

        const leadId = insertResult[0]?.id;
        if (leadId) {
          createdLeadIds.add(leadId);
          console.log("[scraper] Created new lead", {
            leadId,
            name: leadRecord.name,
          });

          // 7. Emit domain event for each created lead
          await emitEvent(
            "outreach.lead.created",
            workspaceId,
            "scraper",
            {
              leadId,
              name: leadRecord.name,
              category: leadRecord.category ?? null,
            },
          );
        }
      }
    }

    // 5. Update search status to 'completed' with result count
    const resultCount = places.length;
    await db
      .update(searches)
      .set({
        status: "completed",
        resultCount,
        completedAt: now,
      })
      .where(eq(searches.id, searchId));

    // 6. Emit search completed event
    await emitEvent(
      "outreach.search.completed",
      workspaceId,
      "scraper",
      {
        searchId,
        resultCount,
      },
    );

    console.log("[scraper] Search completed successfully", {
      searchId,
      resultCount,
      newLeads: createdLeadIds.size,
    });

    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[scraper] Unexpected error processing record", {
      messageId: record.messageId,
      error: errorMsg,
      stack:
        error instanceof Error ? error.stack : undefined,
    });

    // Unexpected errors should be retried by SQS
    return false;
  }
}

/**
 * Lambda handler: processes SQS messages containing search requests
 * Scrapes Google Maps via Outscraper API and writes leads to database
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  console.log("[scraper] Received SQS event with", event.Records.length, "records");

  const results = await Promise.all(
    event.Records.map((record) =>
      processScrapeSearch(record).catch((error) => {
        console.error("[scraper] Unhandled error in processScrapeSearch", {
          messageId: record.messageId,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }),
    ),
  );

  const successful = results.filter(Boolean).length;
  console.log("[scraper] Batch complete:", {
    total: event.Records.length,
    successful,
    failed: event.Records.length - successful,
  });
};
