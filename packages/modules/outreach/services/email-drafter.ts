/**
 * AI email drafter — generates personalised outreach emails
 * based on lead data, pain points, and optional template.
 */

import { generateCompletion } from "./ai";

interface LeadContext {
  name: string;
  category: string;
  suburb: string;
  state: string;
  rating: string;
  reviewCount: number;
  painPoints: string[];
  website: string | null;
}

interface DraftResult {
  subject: string;
  body: string;
  model: string;
  costCents: number;
}

/**
 * Generate a personalised outreach email for a lead.
 */
export async function draftEmail(
  lead: LeadContext,
  serviceDescription: string,
  templateHint?: { subject: string; body: string },
): Promise<DraftResult> {
  const painPointsText =
    lead.painPoints.length > 0
      ? lead.painPoints.map((p) => `- ${p}`).join("\n")
      : "- No specific pain points identified yet";

  const templateContext = templateHint
    ? `\n\nUse this template as a starting point (adapt it, don't copy verbatim):\nSubject: ${templateHint.subject}\nBody:\n${templateHint.body}`
    : "";

  const prompt = `Write a personalised cold outreach email to ${lead.name}, a ${lead.category} in ${lead.suburb}, ${lead.state}.

About the lead:
- Google rating: ${lead.rating}★ (${lead.reviewCount} reviews)
- Website: ${lead.website ?? "No website found"}
- Key pain points from their reviews:
${painPointsText}

About our service:
${serviceDescription || "We help businesses improve their operations, online presence, and client management."}
${templateContext}

Requirements:
- Keep it under 150 words
- Be conversational and Australian in tone
- Reference a specific pain point or opportunity
- Include a clear, low-commitment call to action (e.g., 10-min chat)
- Don't be salesy or pushy
- Don't use generic phrases like "I noticed your business"

Return a JSON object with:
{
  "subject": "<email subject line, under 60 chars>",
  "body": "<email body text>"
}

Return ONLY valid JSON.`;

  const result = await generateCompletion(prompt, {
    systemPrompt:
      "You are an expert cold email copywriter specialising in B2B outreach for the Australian market. Write emails that feel personal and genuine.",
    maxTokens: 512,
    temperature: 0.7,
  });

  try {
    let cleaned = result.text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(cleaned);

    return {
      subject: parsed.subject ?? `Quick question about ${lead.name}`,
      body: parsed.body ?? result.text,
      model: result.model,
      costCents: result.costCents,
    };
  } catch {
    // If JSON parsing fails, use raw text as body
    return {
      subject: `Quick question about ${lead.name}`,
      body: result.text,
      model: result.model,
      costCents: result.costCents,
    };
  }
}
