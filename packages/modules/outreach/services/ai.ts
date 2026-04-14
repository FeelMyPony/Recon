/**
 * Unified AI completion service.
 * Tries LM Studio (local Gemma) first, falls back to Claude API.
 * All AI-powered features go through this single function.
 */

export interface AICompletionResult {
  text: string;
  model: string;
  costCents: number;
  provider: "lm-studio" | "claude";
}

interface AIOptions {
  /** System prompt for the AI */
  systemPrompt?: string;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Temperature (0-1) */
  temperature?: number;
  /** Connection timeout for LM Studio in ms (default 5000) */
  lmStudioTimeout?: number;
}

/**
 * Generate a completion using LM Studio (primary) or Claude (fallback).
 *
 * LM Studio uses OpenAI-compatible API at localhost:1234/v1.
 * Claude uses the Anthropic SDK.
 */
export async function generateCompletion(
  prompt: string,
  options: AIOptions = {},
): Promise<AICompletionResult> {
  const {
    systemPrompt,
    maxTokens = 1024,
    temperature = 0.3,
    lmStudioTimeout = 5000,
  } = options;

  // 1. Try LM Studio first
  const lmBaseUrl = process.env.LM_STUDIO_BASE_URL;
  const lmModel = process.env.LM_STUDIO_MODEL ?? "google/gemma-3-4b-it";

  if (lmBaseUrl) {
    try {
      const result = await callLMStudio(
        lmBaseUrl,
        lmModel,
        prompt,
        systemPrompt,
        maxTokens,
        temperature,
        lmStudioTimeout,
      );
      return result;
    } catch (err) {
      console.warn(
        "[ai] LM Studio unavailable, falling back to Claude:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // 2. Fall back to Claude API
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error(
      "No AI provider available. Set LM_STUDIO_BASE_URL or ANTHROPIC_API_KEY.",
    );
  }

  return callClaude(anthropicKey, prompt, systemPrompt, maxTokens, temperature);
}

// ─── LM Studio (OpenAI-compatible) ────────────────────────────────────

async function callLMStudio(
  baseUrl: string,
  model: string,
  prompt: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
): Promise<AICompletionResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`LM Studio HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";

    console.log("[ai] LM Studio response", {
      model,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    });

    return {
      text: text.trim(),
      model,
      costCents: 0, // Local model = free
      provider: "lm-studio",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Claude API ────────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  prompt: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number,
): Promise<AICompletionResult> {
  const model = "claude-sonnet-4-20250514";

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
    temperature,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  const text = textBlock?.text ?? "";

  // Cost: Sonnet $3/1M input, $15/1M output
  const inputCost = ((data.usage?.input_tokens ?? 0) / 1_000_000) * 300;
  const outputCost = ((data.usage?.output_tokens ?? 0) / 1_000_000) * 1500;
  const costCents = Math.ceil(inputCost + outputCost);

  console.log("[ai] Claude response", {
    model,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    costCents,
  });

  return {
    text: text.trim(),
    model,
    costCents,
    provider: "claude",
  };
}

/**
 * Parse JSON from AI response, handling markdown code fences.
 */
export function parseAIJson<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned);
}
