import type { SQSEvent, SQSHandler } from "aws-lambda";

/**
 * Scraper worker: triggered by SQS when a new search is created.
 * Calls the Outscraper API to scrape Google Maps results,
 * then writes leads to the database.
 *
 * TODO: Implement Outscraper API integration
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const message = JSON.parse(body.Message ?? body);

    console.log("[scraper] Processing search:", {
      searchId: message.payload?.searchId,
      workspaceId: message.workspaceId,
    });

    // TODO:
    // 1. Fetch search details from DB
    // 2. Call Outscraper API with query + location
    // 3. Parse results into lead records
    // 4. Insert leads into database (upsert by google_place_id)
    // 5. Update search status to 'completed'
    // 6. Emit 'outreach.search.completed' event
  }
};
