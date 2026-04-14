/**
 * Pitch page generator — creates personalised HTML pitch pages for leads.
 * Each page shows how the user's service solves the lead's specific pain points.
 */

import { generateCompletion } from "./ai";

interface PitchContext {
  leadName: string;
  category: string;
  suburb: string;
  state: string;
  rating: string;
  reviewCount: number;
  painPoints: string[];
  strengths: string[];
  opportunities: string[];
  serviceDescription: string;
  senderName: string;
}

/**
 * Generate a complete HTML pitch page tailored to a specific lead.
 */
export async function generatePitchPage(
  ctx: PitchContext,
): Promise<{ html: string; model: string; costCents: number }> {
  const prompt = `Generate a professional, modern HTML pitch page for ${ctx.leadName}.

ABOUT THE LEAD:
- Business: ${ctx.leadName} (${ctx.category})
- Location: ${ctx.suburb}, ${ctx.state}
- Google Rating: ${ctx.rating}★ (${ctx.reviewCount} reviews)
- Pain points from reviews: ${ctx.painPoints.length > 0 ? ctx.painPoints.join("; ") : "None identified"}
- Strengths: ${ctx.strengths.length > 0 ? ctx.strengths.join("; ") : "Unknown"}
- Opportunities: ${ctx.opportunities.length > 0 ? ctx.opportunities.join("; ") : "General improvement"}

OUR SERVICE:
${ctx.serviceDescription || "We help businesses improve their operations, online presence, and client satisfaction."}

REQUIREMENTS:
- Return ONLY the full HTML document (<!DOCTYPE html> to </html>)
- Modern, clean design with inline CSS (no external stylesheets)
- Color scheme: navy (#0F1B2D) headers, teal (#00BFA6) accents, white background
- Font: system-ui, -apple-system, sans-serif
- Sections:
  1. Hero: "How We Can Help ${ctx.leadName}" with a brief tagline
  2. "What We Found": 2-3 bullet points about their current situation (from reviews)
  3. "How We Can Help": 3 specific solutions mapped to their pain points
  4. "Why Now": urgency/opportunity section
  5. CTA: "Let's Chat" button (mailto: or a simple call to action)
  6. Footer: "Prepared for ${ctx.leadName} by ${ctx.senderName}"
- Mobile responsive (max-width media query)
- Professional but warm Australian tone
- Under 200 lines of HTML
- No JavaScript, no external resources

Return ONLY the HTML. No markdown fences, no explanation.`;

  const result = await generateCompletion(prompt, {
    systemPrompt:
      "You are a web designer creating personalised pitch pages. Output clean, semantic HTML with inline CSS. No markdown, no code fences — return raw HTML only.",
    maxTokens: 2048,
    temperature: 0.5,
  });

  // Clean up: strip any markdown fences if present
  let html = result.text.trim();
  if (html.startsWith("```")) {
    html = html.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "");
  }

  // Ensure it starts with DOCTYPE or html tag
  if (!html.toLowerCase().startsWith("<!doctype") && !html.toLowerCase().startsWith("<html")) {
    html = `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Proposal for ${ctx.leadName}</title></head>\n<body>${html}</body></html>`;
  }

  return {
    html,
    model: result.model,
    costCents: result.costCents,
  };
}
