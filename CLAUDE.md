# RECON Platform — Development Guide

## Project Overview
RECON is a multi-tenant AI-powered outreach automation platform built for the Australian NDIS/allied health market. It scrapes Google Maps leads via Outscraper, analyses reviews with Claude AI, scores leads, and automates email outreach via AWS SES.

Architected for expansion into workforce management and other verticals.

## Tech Stack
- **Frontend**: Next.js 15 App Router (Vercel) + Tailwind CSS + shadcn/ui + Mapbox GL
- **API**: tRPC v11 (end-to-end type safety, superjson transformer)
- **Auth**: Auth.js v5 (magic link via SES/Mailpit + Google OAuth, DB sessions)
- **ORM**: Drizzle ORM with drizzle-kit migrations
- **Database**: PostgreSQL 16 + PostGIS (AWS RDS in prod, Docker locally)
- **Email**: AWS SES (prod), Mailpit (dev on port 1025, UI on 8025)
- **Background Jobs**: AWS SQS + Lambda (scraper, analyser, emailer workers)
- **Events**: Domain event bus — SNS in prod, in-memory in dev (`packages/events/`)
- **IaC**: Terraform (13 files in `infra/terraform/`)
- **Monorepo**: Turborepo + pnpm workspaces
- **CI/CD**: GitHub Actions + Vercel Git integration

## Architecture: Module-First
Each product vertical is a self-contained module under `packages/modules/`:
```
packages/modules/shared/    — Auth tables, workspaces, activity_log
packages/modules/outreach/  — Leads, reviews, searches, templates, sequences, emails
packages/modules/workforce/ — (future) Rostering, timesheets, compliance
```

New modules get their own schema/, router.ts, services/, and events.ts. They communicate via domain events, never direct imports.

## Key Patterns

### Multi-tenancy
Every table has `workspace_id`. Dual isolation:
1. tRPC middleware injects workspace_id into context
2. Postgres RLS via `SET LOCAL app.workspace_id` (defense-in-depth)

### Database
- Lazy DB client (`getDb()` in `packages/db/client.ts`) — avoids crashes during Next.js build
- Auth.js tables in public schema, outreach tables will use `outreach` Postgres schema
- `workspace_id` denormalized onto child tables (reviews, notes, lead_socials) for performance
- `sequence_steps` is a normalized table, not JSONB

### Auth
- Lazy initialization in `packages/auth/index.ts` — `getAuth()` creates NextAuth instance on first call
- API routes use `export const dynamic = "force-dynamic"` to skip prerendering
- Middleware checks session cookie directly (not Auth.js wrapper) for edge compatibility

### tRPC
- Single tRPC init in `packages/modules/outreach/trpc.ts`
- Root router merges module routers in `apps/web/lib/trpc/server.ts`
- Context provides `{ db, userId, workspaceId }`
- Client setup: `apps/web/lib/trpc/client.ts` + `provider.tsx`

## Brand
- Navy: `#0F1B2D` (bg-brand-navy-900)
- Teal: `#00BFA6` (bg-brand-teal)
- Score colors: Hot=#ef4444, Warm=#f59e0b, Cold=#60a5fa, Unscored=#94a3b8
- Font: Inter (sans), JetBrains Mono (mono)

## Running Locally
```bash
docker compose up -d          # PostGIS + Mailpit
cp .env.example .env          # Fill in values
pnpm install && pnpm dev      # Next.js on :3000
```
Mailpit UI: http://localhost:8025 (catches magic link emails)

## Commands
- `pnpm dev` — Start Next.js dev server
- `pnpm build` — Production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript check
- `pnpm db:generate` — Generate Drizzle migrations
- `pnpm db:migrate` — Apply migrations
- `pnpm db:studio` — Drizzle Studio (DB browser)

## Current State (as of 2026-04-13)
### Done (Phase 1 Foundation + Phase 2 UI)
- Full monorepo scaffold (84 files)
- Drizzle schema: 14 tables across shared + outreach modules
- Auth: magic link + Google OAuth with lazy init
- tRPC: full client/server wiring with React Query
- Middleware: session cookie check, redirect logic
- Dashboard: sidebar, topbar, search modal
- Map view: Mapbox GL with dark theme + SVG fallback
- Leads table: sortable, filterable, bulk select, pain points
- Lead detail panel: contact info, AI pain points, action buttons
- Outreach module: sequences, templates (with editor modal), sent emails
- Analytics: stats cards, pipeline funnel, score ring chart, activity feed
- Settings: workspace config, API keys status, team, notifications
- Terraform: RDS, RDS Proxy, SES, S3, SNS, SQS+DLQs, Lambda, Secrets, IAM, CloudWatch
- CI/CD: GitHub Actions workflows
- Docker compose: PostGIS + Mailpit

### Not Done Yet
- **Outscraper integration**: Wire search modal -> SQS -> Lambda scraper -> DB
- **Claude AI analysis**: Wire lead reviews -> Lambda analyser -> review_analyses table
- **Auto lead scoring**: Score leads based on AI analysis output
- **Real tRPC data**: Replace mock data in components with tRPC queries
- **Email sending**: Wire outreach emails -> SQS -> Lambda emailer -> SES
- **Open/click tracking**: SES webhook handler for email events
- **Mapbox clustering**: Add cluster layer for dense lead areas
- **CSV import/export**: Bulk lead operations via S3
- **Team invitations**: Multi-user workspace access
- **PostGIS geo queries**: Location-based lead filtering (within X km)
- **AWS deployment**: Run Terraform, connect Vercel, run migrations
- **Git repo**: Not initialized yet

## Rules
- Always use the module-first pattern — new features go in their module, not shared
- Keep `.js` extensions OUT of TypeScript imports (Next.js bundler can't resolve them)
- Use `getDb()` not `db` directly when the code might run during build
- API routes need `export const dynamic = "force-dynamic"`
- Mock data lives in components temporarily — replace with tRPC queries
- Don't add Supabase-specific patterns (no `auth.uid()`, no `auth.users`)
- Brand colors: use Tailwind classes (`bg-brand-navy-900`, `text-brand-teal`) not inline styles
