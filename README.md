# RECON

AI-powered outreach automation platform.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for Postgres + Mailpit)
- Homebrew (macOS — for Ollama install)

## Press-and-play local setup

```bash
# One-time setup (installs Ollama + pulls Gemma, runs docker, copies .env)
pnpm install
pnpm setup:ai

# Daily use — one command starts everything
pnpm dev:local
```

That's it. `pnpm dev:local` starts Ollama, Postgres, Mailpit, and the Next.js dev server. Scraping + AI analysis both run locally on your machine using Ollama with Gemma 3 4B (~free, ~1-2s per analysis).

**Open http://localhost:3000** — login with Google or magic link (magic links appear in Mailpit at http://localhost:8025).

## Quick Start (manual)

```bash
docker compose up -d          # Postgres + Mailpit
ollama serve &                 # Local LLM (optional)
ollama pull gemma3:4b
cp .env.example .env           # Fill in OUTSCRAPER_API_KEY
pnpm install && pnpm dev
```

## Project Structure

```
apps/
  web/          Next.js frontend
  api/          Backend API
packages/
  db/           Drizzle schema, migrations, client
  shared/       Shared types and utilities
workers/        Lambda functions (enrichment, scoring, etc.)
infra/
  terraform/    Infrastructure as code
```

## Tech Stack

- Next.js (App Router)
- tRPC
- Drizzle ORM + PostgreSQL
- Redis (BullMQ)
- AWS Lambda
- Terraform

## Available Scripts

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `pnpm dev:local`   | **Press-and-play:** Ollama + Docker + Next.js |
| `pnpm setup:ai`    | One-time: install Ollama + pull Gemma |
| `pnpm dev`         | Start all apps in development mode |
| `pnpm build`       | Build all packages and apps        |
| `pnpm lint`        | Run ESLint across the monorepo     |
| `pnpm typecheck`   | Run TypeScript type checking       |
| `pnpm db:generate` | Generate Drizzle migrations        |
| `pnpm db:migrate`  | Apply database migrations          |
| `pnpm db:seed`     | Seed database with dev data        |
| `pnpm db:studio`   | Open Drizzle Studio                |

## Environment Variables

Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

See `.env.example` for all available configuration options.

## Map + Scraping Workflow

The app uses Google Maps for the map display only. Scraping runs through
Outscraper (same service the AWS Lambda scraper uses, ~30x cheaper than
Google Places) via a local Node worker on your Mac. Lead scoring uses LM
Studio running a local Gemma model, so inference is free.

### One-time setup

1. In GCP Console enable **Maps JavaScript API** on the existing
   `recon-493304` project and set up billing. Places API is not needed,
   the worker does not use it.
2. Create one browser-facing API key, restricted to
   `https://recon-platform.vercel.app/*` and `http://localhost:3000/*`
   HTTP referrers, restricted to Maps JavaScript API only. Add as
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Vercel and local `.env`.
3. Grab your `OUTSCRAPER_API_KEY` from https://app.outscraper.com/profile
   (same key used by the Lambda scraper). Add to local `.env`.
4. In LM Studio: download `google/gemma-3-4b-it` (or similar), load it, then
   click "Start Server" to expose it on `http://localhost:1234/v1`.
5. Copy `.env.example` to `.env` and fill in all keys.

### Daily use

In one terminal:

```bash
pnpm --filter @recon/web dev
```

In a second terminal:

```bash
pnpm --filter @recon/local-scraper start
```

Open the Map page, click **Radius** or **Polygon** in the toolbar, draw an
area, hit **Scrape this area**, type the business type (e.g. "traffic
management Melbourne") and queue the job. The worker picks it up within a
few seconds, populates leads, and scores them via Gemma. Leads appear on the
map automatically when the query refetches.

## Infrastructure

Infrastructure is managed with Terraform in `infra/terraform/`. See that directory for resource definitions and deployment instructions.

Note: the AWS Lambda workers under `workers/scraper/`, `workers/analyser/`,
and `workers/emailer/` are scaffolded for a future production path. For
current development, `workers/local-scraper/` supersedes the Lambda scraper.
