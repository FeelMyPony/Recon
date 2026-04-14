/**
 * Local scraper + LLM worker configuration.
 * Reads from process.env. Fails fast if required vars are missing.
 */

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  outscraperApiKey: required("OUTSCRAPER_API_KEY"),
  lmStudioBaseUrl: optional("LM_STUDIO_BASE_URL", "http://localhost:1234/v1"),
  lmStudioModel: optional("LM_STUDIO_MODEL", "google/gemma-3-4b-it"),
  pollIntervalMs: Number(optional("SCRAPER_POLL_MS", "5000")),
  maxResultsPerSearch: Number(
    optional("SCRAPER_MAX_RESULTS", "60"),
  ),
  enableWebsiteEmailScrape:
    optional("SCRAPER_SCRAPE_EMAILS", "true").toLowerCase() === "true",
  enableLlmScoring:
    optional("SCRAPER_LLM_SCORING", "true").toLowerCase() === "true",
} as const;
