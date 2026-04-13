import type { SQSEvent, SQSHandler } from "aws-lambda";

/**
 * Analyser worker: triggered when leads are scraped.
 * Uses Claude API to analyse Google reviews and generate:
 * - Sentiment score
 * - Strengths / weaknesses / opportunities
 * - AI lead score (hot/warm/cold)
 * - Pain points for outreach personalisation
 *
 * TODO: Implement Claude API integration
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const message = JSON.parse(body.Message ?? body);

    console.log("[analyser] Processing lead:", {
      leadId: message.payload?.leadId,
      workspaceId: message.workspaceId,
    });

    // TODO:
    // 1. Fetch lead + reviews from DB
    // 2. Build prompt with review text
    // 3. Call Claude API for analysis
    // 4. Parse response into structured data
    // 5. Insert review_analysis record
    // 6. Update lead.score based on AI recommendation
    // 7. Emit 'outreach.review.analysed' event
  }
};
