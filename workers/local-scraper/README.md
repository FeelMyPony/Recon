# @recon/local-scraper

Local Node.js worker that polls the `searches` table for pending jobs,
queries **Outscraper** within a user-drawn area, upserts leads into Postgres,
optionally scrapes business websites for contact emails, and scores each new
lead via a local LLM running in LM Studio.

Designed to run on your own Mac so that LLM inference is free and scraping
stays cheap. Uses the same Outscraper account and endpoint as the existing
AWS Lambda scraper (`workers/scraper/handler.ts`), so there's nothing extra
to pay for.

## Why Outscraper, not Google Places

Outscraper: ~$1 per 1,000 businesses returned.
Google Places Text Search (New): ~$32 per 1,000 requests of up to 20 places.

For the volumes RECON runs at, Outscraper is roughly 30x cheaper. Google
Maps is still used for the map tiles and drawing UI in the browser, just
not for the scraping itself.

## What it does

1. Polls `searches` where `status = 'pending'`, claims one at a time with
   `SELECT ... FOR UPDATE SKIP LOCKED`.
2. Reads the area geometry from `filters.area` (circle or polygon, written by
   the `searches.createFromArea` tRPC mutation).
3. Reverse-geocodes the area centre via Nominatim (free OpenStreetMap
   service) to get a locality name like "Carlton, Victoria, Australia".
4. Calls Outscraper with `"{query} in {locality}"`, asking for 1.5x the
   result limit.
5. Filters the returned places to the exact drawn area (distance for circles,
   point-in-polygon for polygons) so you get precisely what you drew.
6. For each place: upserts by `(workspace_id, google_place_id)`, prefers any
   email Outscraper found, otherwise fetches the business homepage + `/contact`
   page and extracts an email via regex with light deobfuscation.
7. For each *new* lead: sends a short prompt to LM Studio (OpenAI-compatible
   `/v1/chat/completions`) asking Gemma to score the lead `hot` / `warm` /
   `cold` in RTT's context, and writes that back to `leads.score`.
8. Marks the search `completed` with `result_count`.

## Prereqs

- Node 20+ and pnpm installed
- An Outscraper account with an API key (same one used by the Lambda scraper).
  Sign up at https://app.outscraper.com if you don't have one.
- LM Studio running with a model loaded (e.g. `google/gemma-3-4b-it`) and
  the local server started on `http://localhost:1234/v1`

## Env vars

All read from the root `.env` (or export in shell):

```
DATABASE_URL=postgresql://...
OUTSCRAPER_API_KEY=...
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=google/gemma-3-4b-it
SCRAPER_POLL_MS=5000
SCRAPER_MAX_RESULTS=60
SCRAPER_SCRAPE_EMAILS=true
SCRAPER_LLM_SCORING=true
```

## Run

From the monorepo root:

```bash
pnpm install
pnpm --filter @recon/local-scraper start
```

Or in dev mode with auto-reload:

```bash
pnpm --filter @recon/local-scraper dev
```

Leave this running in a terminal while you use the app. Every time you draw
an area on the map and click "Scrape this area", this process will see the
new row within a few seconds and start pulling leads.

## Troubleshooting

- **"Missing required env var: OUTSCRAPER_API_KEY"** . set it in `.env` at
  the repo root. The same key works for both the AWS Lambda scraper and the
  local worker.
- **"LM Studio not reachable"** . LM Studio's server isn't running. Open LM
  Studio, load a model, and click the "Start Server" button. Verify with
  `curl http://localhost:1234/v1/models`.
- **Outscraper 401 / 403** . your API key is wrong or your Outscraper plan
  has run out of credits.
- **Nominatim rate limit** . the worker does one reverse-geocode per search,
  well within Nominatim's 1/second limit. If you start seeing 429s you're
  running multiple workers, which Nominatim's fair use policy asks you not
  to do without setting up your own instance.
- **No leads appear on the map after a search** . check the worker terminal
  for errors, and check `searches.status` in Supabase Studio; if it's `failed`
  the reason is in the logs.
