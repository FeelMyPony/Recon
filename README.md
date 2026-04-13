# RECON

AI-powered outreach automation platform.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker

## Quick Start

```bash
docker compose up -d
cp .env.example .env
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
| `pnpm dev`         | Start all apps in development mode |
| `pnpm build`       | Build all packages and apps        |
| `pnpm lint`        | Run ESLint across the monorepo     |
| `pnpm typecheck`   | Run TypeScript type checking       |
| `pnpm db:generate` | Generate Drizzle migrations        |
| `pnpm db:migrate`  | Apply database migrations          |
| `pnpm db:studio`   | Open Drizzle Studio                |

## Environment Variables

Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

See `.env.example` for all available configuration options.

## Infrastructure

Infrastructure is managed with Terraform in `infra/terraform/`. See that directory for resource definitions and deployment instructions.
