import type { SQSEvent, SQSHandler, SQSRecord } from "aws-lambda";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { leads } from "../../packages/modules/outreach/schema/leads";
import {
  reviews,
  reviewAnalyses,
} from "../../packages/modules/outreach/schema/reviews";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DomainEventMessage {
  type: string;
  workspaceId: string;
  payload: {
    leadId: string;
  };
}

interface AnalysisResult {
  sentimentScore: number;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  summary: string;
  aiScore: "hot" | "warm" | "cold";
  aiRationale: string;
}

// ---------------------------------------------------------------------------
// Lazy-initialised singletons
// ---------------------------------------------------------------------------

let _db: PostgresJsDatabase | null = null;
let _anthropic: Anthropic | null = null;

function getDb(): PostgresJsDatabase {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    _db = drizzle(postgres(url, { max: 5 }));
  }
  return _db;
}

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is required");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

// ---------------------------------------------------------------------------
// SQS message parsing
// ---------------------------------------------------------------------------

function parseMessage(record: SQSRecord): DomainEventMessage {
  const body = JSON.parse(record.body);
  const message = JSON.parse(body.Message ?? JSON.stringify(body));

  if (!message.workspaceId || !message.payload?.leadId) {
    throw new Error(`Invalid event: missing workspaceId or leadId`);
  }
  return message as DomainEventMessage;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  leadName: string,
  reviewRecords: Array<{ author: string | null; rating: number | null; text: string | null; ownerReply: string | null }>,
): string {
  const reviewsText = reviewRecords
    .map(
      (r, i) =>
        `Review ${i + 1} (${r.rating ?? "?"}★ by ${r.author ?? "Anonymous"}):\n${r.text ?? "(no text)"}${r.ownerReply ? `\nOwner reply: ${r.ownerReply}` : ""}`,
    )
    .join("\n\n");

  return `You are a business intelligence analyst helping an outreach team in the Australian NDIS/allied health market.

Analyse the following ${reviewRecords.length} Google reviews for "${leadName}" and return a JSON object with exactly these fields:

{
  "sentimentScore": <number 0-1, where 0 = very negative, 1 = very positive>,
  "strengths": [<up to 5 strings: key strengths from reviews>],
  "weaknesses": [<up to 5 strings: pain points, complaints, or issues>],
  "opportunities": [<up to 5 strings: outreach angles, unmet needs, or areas where external help could add value>],
  "summary": "<2-3 sentence overview of review sentiment and themes>",
  "aiScore": "<one of: hot, warm, cold>",
  "aiRationale": "<1-2 sentences explaining the score>"
}

Scoring guide:
- "hot": Multiple clear pain points or opportunities. Strong outreach potential.
- "warm": Some opportunities, moderate pain points. Worth contacting.
- "cold": Few issues, well-run business. Lower outreach priority.

Return ONLY valid JSON. No markdown fences, no extra text.

Reviews:
${reviewsText}`;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function analyseWithClaude(
  leadName: string,
  reviewRecords: Array<{ author: string | null; rating: number | null; text: string | null; ownerReply: string | null }>,
): Promise<{ analysis: AnalysisResult; tokenCostCents: number }> {
  const prompt = buildPrompt(leadName, reviewRecords);
  const anthropic = getAnthropic();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  // Strip possible markdown fences
  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(jsonStr) as AnalysisResult;

  // Validate + constrain
  const analysis: AnalysisResult = {
    sentimentScore: Math.min(1, Math.max(0, Number(parsed.sentimentScore) || 0)),
    strengths: (parsed.strengths ?? []).slice(0, 5),
    weaknesses: (parsed.weaknesses ?? []).slice(0, 5),
    opportunities: (parsed.opportunities ?? []).slice(0, 5),
    summary: parsed.summary ?? "",
    aiScore: ["hot", "warm", "cold"].includes(parsed.aiScore) ? parsed.aiScore : "cold",
    aiRationale: parsed.aiRationale ?? "",
  };

  // Cost estimate: Sonnet $3/1M input, $15/1M output
  const inputCost = (response.usage.input_tokens / 1_000_000) * 300; // cents
  const outputCost = (response.usage.output_tokens / 1_000_000) * 1500;
  const tokenCostCents = Math.ceil(inputCost + outputCost);

  console.log("[analyser] Claude response", {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costCents: tokenCostCents,
    aiScore: analysis.aiScore,
  });

  return { analysis, tokenCostCents };
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

async function processLead(record: SQSRecord): Promise<boolean> {
  const db = getDb();

  const message = parseMessage(record);
  const { workspaceId, payload } = message;
  const { leadId } = payload;

  console.log("[analyser] Processing lead", { leadId, workspaceId });

  // 1. Fetch lead
  const [lead] = await db
    .select({ id: leads.id, name: leads.name })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId)))
    .limit(1);

  if (!lead) {
    console.warn("[analyser] Lead not found", { leadId, workspaceId });
    return false; // Don't retry
  }

  // 2. Fetch reviews
  const leadReviews = await db
    .select({
      author: reviews.author,
      rating: reviews.rating,
      text: reviews.text,
      ownerReply: reviews.ownerReply,
    })
    .from(reviews)
    .where(and(eq(reviews.leadId, leadId), eq(reviews.workspaceId, workspaceId)))
    .orderBy(desc(reviews.publishedAt));

  if (leadReviews.length === 0) {
    console.log("[analyser] No reviews for lead, setting cold score", { leadId });

    // No reviews: store minimal analysis, set cold
    await db.insert(reviewAnalyses).values({
      leadId,
      workspaceId,
      sentimentScore: "0.50",
      strengths: [],
      weaknesses: [],
      opportunities: [],
      summary: "No reviews available for analysis.",
      aiScore: "cold",
      aiRationale: "No reviews to analyse. Low outreach priority.",
      modelUsed: "none",
      tokenCostCents: 0,
    });

    await db
      .update(leads)
      .set({ score: "cold", updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    return true;
  }

  // 3. Call Claude
  const { analysis, tokenCostCents } = await analyseWithClaude(lead.name, leadReviews);

  // 4. Store review analysis
  const [inserted] = await db
    .insert(reviewAnalyses)
    .values({
      leadId,
      workspaceId,
      sentimentScore: String(analysis.sentimentScore),
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      opportunities: analysis.opportunities,
      summary: analysis.summary,
      aiScore: analysis.aiScore,
      aiRationale: analysis.aiRationale,
      modelUsed: "claude-sonnet-4-20250514",
      tokenCostCents,
    })
    .returning({ id: reviewAnalyses.id });

  console.log("[analyser] Stored analysis", { analysisId: inserted?.id, aiScore: analysis.aiScore });

  // 5. Update lead score
  await db
    .update(leads)
    .set({ score: analysis.aiScore, updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  // 6. Emit domain event (best-effort)
  try {
    const { emitEvent } = await import("../../packages/events/bus");
    await emitEvent("outreach.review.analysed", workspaceId, "analyser", {
      leadId,
      analysisId: inserted?.id,
      aiScore: analysis.aiScore,
    });
  } catch {
    console.warn("[analyser] Failed to emit event (non-fatal)");
  }

  console.log("[analyser] Lead analysis complete", {
    leadId,
    name: lead.name,
    aiScore: analysis.aiScore,
    reviewCount: leadReviews.length,
  });

  return true;
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler: SQSHandler = async (event: SQSEvent) => {
  console.log("[analyser] Received", event.Records.length, "records");

  const results = await Promise.allSettled(
    event.Records.map((record) => processLead(record)),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = results.length - succeeded;

  console.log("[analyser] Batch complete", { succeeded, failed, total: results.length });
};
