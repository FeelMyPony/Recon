/**
 * Analyser service — AI-powered review analysis and lead scoring.
 * Uses LM Studio (local Gemma) primarily, Claude API as fallback.
 */

import { eq, and, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { leads } from "../schema/leads";
import { reviews, reviewAnalyses } from "../schema/reviews";
import { generateCompletion, parseAIJson } from "./ai";

interface AnalysisResult {
  sentimentScore: number;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  summary: string;
  aiScore: "hot" | "warm" | "cold";
  aiRationale: string;
}

/**
 * Analyse a single lead's reviews and update their score.
 * Returns the analysis result or null if no reviews found.
 */
export async function analyseLead(
  db: PostgresJsDatabase,
  leadId: string,
  workspaceId: string,
): Promise<AnalysisResult | null> {
  // 1. Fetch lead
  const [lead] = await db
    .select({ id: leads.id, name: leads.name })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId)))
    .limit(1);

  if (!lead) {
    console.warn("[analyser] Lead not found:", leadId);
    return null;
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

  // 3. No reviews — set cold score
  if (leadReviews.length === 0) {
    const coldAnalysis: AnalysisResult = {
      sentimentScore: 0.5,
      strengths: [],
      weaknesses: ["No Google reviews found"],
      opportunities: ["Needs review generation strategy", "May benefit from digital presence support"],
      summary: "No reviews available for analysis. Limited online presence suggests potential opportunity.",
      aiScore: "cold",
      aiRationale: "No reviews to analyse. Low online visibility suggests either a new business or poor digital presence.",
    };

    await storeAnalysis(db, leadId, workspaceId, coldAnalysis, "none", 0);
    await db.update(leads).set({ score: "cold", updatedAt: new Date() }).where(eq(leads.id, leadId));

    return coldAnalysis;
  }

  // 4. Build prompt and call AI
  const prompt = buildAnalysisPrompt(lead.name, leadReviews);

  console.log("[analyser] Analysing", lead.name, "with", leadReviews.length, "reviews");

  const aiResult = await generateCompletion(prompt, {
    systemPrompt: "You are a business intelligence analyst for the Australian NDIS/allied health market. Return ONLY valid JSON, no markdown fences.",
    maxTokens: 1024,
    temperature: 0.3,
  });

  // 5. Parse and validate
  const parsed = parseAIJson<AnalysisResult>(aiResult.text);
  const analysis: AnalysisResult = {
    sentimentScore: Math.min(1, Math.max(0, Number(parsed.sentimentScore) || 0)),
    strengths: (parsed.strengths ?? []).slice(0, 5),
    weaknesses: (parsed.weaknesses ?? []).slice(0, 5),
    opportunities: (parsed.opportunities ?? []).slice(0, 5),
    summary: parsed.summary ?? "",
    aiScore: ["hot", "warm", "cold"].includes(parsed.aiScore) ? parsed.aiScore : "cold",
    aiRationale: parsed.aiRationale ?? "",
  };

  // 6. Store analysis and update lead score
  await storeAnalysis(db, leadId, workspaceId, analysis, aiResult.model, aiResult.costCents);
  await db.update(leads).set({ score: analysis.aiScore, updatedAt: new Date() }).where(eq(leads.id, leadId));

  console.log("[analyser] Scored", lead.name, "as", analysis.aiScore, "via", aiResult.provider);
  return analysis;
}

/**
 * Analyse multiple leads in sequence (with rate limiting).
 */
export async function analyseLeads(
  db: PostgresJsDatabase,
  leadIds: string[],
  workspaceId: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<number> {
  let analysed = 0;
  for (let i = 0; i < leadIds.length; i++) {
    try {
      await analyseLead(db, leadIds[i]!, workspaceId);
      analysed++;
    } catch (err) {
      console.error("[analyser] Failed to analyse lead", leadIds[i], err);
    }
    onProgress?.(i + 1, leadIds.length);

    // Rate limit: 200ms between calls to avoid overwhelming LM Studio
    if (i < leadIds.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return analysed;
}

// ─── Prompt ────────────────────────────────────────────────────────────

function buildAnalysisPrompt(
  leadName: string,
  reviewRecords: Array<{ author: string | null; rating: number | null; text: string | null; ownerReply: string | null }>,
): string {
  const reviewsText = reviewRecords
    .map(
      (r, i) =>
        `Review ${i + 1} (${r.rating ?? "?"}★ by ${r.author ?? "Anonymous"}):\n${r.text ?? "(no text)"}${r.ownerReply ? `\nOwner reply: ${r.ownerReply}` : ""}`,
    )
    .join("\n\n");

  return `Analyse the following ${reviewRecords.length} Google reviews for "${leadName}" and return a JSON object with exactly these fields:

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

Return ONLY valid JSON.

Reviews:
${reviewsText}`;
}

// ─── Storage ───────────────────────────────────────────────────────────

async function storeAnalysis(
  db: PostgresJsDatabase,
  leadId: string,
  workspaceId: string,
  analysis: AnalysisResult,
  model: string,
  costCents: number,
) {
  await db.insert(reviewAnalyses).values({
    leadId,
    workspaceId,
    sentimentScore: String(analysis.sentimentScore),
    strengths: analysis.strengths,
    weaknesses: analysis.weaknesses,
    opportunities: analysis.opportunities,
    summary: analysis.summary,
    aiScore: analysis.aiScore,
    aiRationale: analysis.aiRationale,
    modelUsed: model,
    tokenCostCents: costCents,
  });
}
