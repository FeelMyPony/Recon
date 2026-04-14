/**
 * LM Studio client — OpenAI-compatible chat completions.
 * Runs against a local model (e.g. Gemma 3 4B IT) loaded in LM Studio.
 *
 * No API key required; LM Studio exposes /v1/chat/completions on localhost.
 */

import { config } from "./config.ts";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
}

async function chat(
  messages: ChatMessage[],
  opts: {
    temperature?: number;
    maxTokens?: number;
    jsonOnly?: boolean;
  } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.lmStudioModel,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 512,
    stream: false,
  };
  if (opts.jsonOnly) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${config.lmStudioBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      `LM Studio ${res.status}: ${err.slice(0, 300)}. Is the server running at ${config.lmStudioBaseUrl}?`,
    );
  }

  const data = (await res.json()) as ChatCompletionResponse;
  return data.choices[0]?.message?.content ?? "";
}

export interface LeadForScoring {
  name: string;
  category?: string | null;
  suburb?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  hasEmail: boolean;
  hasWebsite: boolean;
  hasPhone: boolean;
}

export interface ScoringResult {
  score: "hot" | "warm" | "cold";
  reasoning: string;
}

const SCORING_SYSTEM = `You score B2B outreach leads for Real Time Traffic (RTT), a Melbourne road-safety tech company that sells AI-enabled solar traffic cameras and analytics (NearMiss data, Workers Alert) to construction firms, councils, traffic management companies, and event organisers in Australia.

Rules:
- "hot": strong fit, clear buying intent signals (construction/traffic mgmt/council, established business with multiple reviews, active online presence)
- "warm": possible fit but weaker signals (adjacent industry, small team, limited online footprint)
- "cold": unlikely fit (unrelated industry, very small business, no contact info)

Output ONLY valid JSON: {"score":"hot|warm|cold","reasoning":"<1 sentence, <20 words>"}`;

export async function scoreLead(lead: LeadForScoring): Promise<ScoringResult | null> {
  try {
    const userMsg = `Business: ${lead.name}
Category: ${lead.category ?? "unknown"}
Location: ${lead.suburb ?? "unknown"}
Rating: ${lead.rating ?? "n/a"} (${lead.reviewCount ?? 0} reviews)
Has email: ${lead.hasEmail}
Has website: ${lead.hasWebsite}
Has phone: ${lead.hasPhone}

Score this lead.`;

    const raw = await chat(
      [
        { role: "system", content: SCORING_SYSTEM },
        { role: "user", content: userMsg },
      ],
      { temperature: 0.2, maxTokens: 120, jsonOnly: true },
    );

    // Try JSON parse, fall back to regex extraction
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed.score === "hot" ||
        parsed.score === "warm" ||
        parsed.score === "cold"
      ) {
        return {
          score: parsed.score,
          reasoning: String(parsed.reasoning ?? "").slice(0, 200),
        };
      }
    } catch {
      const m = raw.match(/"score"\s*:\s*"(hot|warm|cold)"/i);
      if (m) {
        return { score: m[1]!.toLowerCase() as ScoringResult["score"], reasoning: raw.slice(0, 200) };
      }
    }

    return null;
  } catch (err) {
    console.warn(
      "[llm] Scoring failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

export async function isLmStudioReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${config.lmStudioBaseUrl}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
