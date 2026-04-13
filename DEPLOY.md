# RECON — Vercel Deployment Guide

## Prerequisites
- Vercel account connected to your GitHub
- PostgreSQL 16 + PostGIS database (AWS RDS or Supabase)
- AWS credentials for SES, SQS, Lambda (if using background workers)

## 1. Push to GitHub

```bash
cd recon
git add -A
git commit -m "chore: phase 3 complete — backend wiring + Vercel config"
git remote add origin git@github.com:YOUR_ORG/recon.git
git push -u origin main
```

## 2. Connect to Vercel

Option A — Vercel CLI:
```bash
npx vercel link
npx vercel deploy --prod
```

Option B — Vercel Dashboard:
1. Go to https://vercel.com/new
2. Import your GitHub repo
3. Vercel auto-detects the monorepo via `vercel.json`
4. Root directory: `.` (repo root, not `apps/web`)
5. Framework: Next.js (auto-detected)

## 3. Environment Variables

Set these in Vercel project settings (Settings > Environment Variables):

### Required
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (with `?sslmode=require` for prod) |
| `AUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `AUTH_URL` | Your production URL, e.g. `https://recon.yourdomain.com` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox GL JS access token |

### Optional (enable features)
| Variable | Description |
|---|---|
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `OUTSCRAPER_API_KEY` | Outscraper API key (for lead scraping) |
| `ANTHROPIC_API_KEY` | Anthropic API key (for review analysis) |
| `AWS_REGION` | AWS region, e.g. `ap-southeast-2` |
| `AWS_ACCESS_KEY_ID` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key |
| `EMAIL_FROM` | SES verified sender, e.g. `noreply@yourdomain.com` |

## 4. Database Setup

Run migrations against your production database:
```bash
DATABASE_URL="postgresql://..." pnpm db:migrate
```

Optionally seed with test data:
```bash
DATABASE_URL="postgresql://..." pnpm db:seed
```

## 5. Post-Deploy Checklist

- [ ] Verify app loads at your Vercel URL
- [ ] Check auth flow (magic link or Google OAuth)
- [ ] Confirm map renders with Mapbox token
- [ ] Test search modal triggers (check SQS queue if workers deployed)
- [ ] Run Terraform for AWS resources (`cd infra/terraform && terraform apply`)
