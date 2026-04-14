#!/usr/bin/env bash
# RECON — Press-and-play local dev
# Starts Ollama + Docker (Postgres + Mailpit) + Next.js dev server
set -e

echo "🚀 RECON Local Dev"
echo ""

# 1. Ensure Ollama is running (for AI analysis)
if ! pgrep -x "ollama" > /dev/null; then
  if command -v ollama &> /dev/null; then
    echo "→ Starting Ollama..."
    brew services start ollama 2>/dev/null || nohup ollama serve > /tmp/ollama.log 2>&1 &
    sleep 2
  else
    echo "⚠ Ollama not installed. Run: bash scripts/setup-local-ai.sh"
    echo "  Continuing without local AI (will fall back to Claude API if ANTHROPIC_API_KEY is set)"
  fi
fi

# Quick Ollama health check
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "✓ Ollama running ($(curl -s http://localhost:11434/api/tags | grep -o '\"name\":\"[^\"]*\"' | head -1 | cut -d'"' -f4))"
fi

# 2. Start Docker services (Postgres + Mailpit) if docker-compose.yml exists
if [ -f docker-compose.yml ]; then
  if command -v docker &> /dev/null; then
    echo "→ Starting Postgres + Mailpit via Docker..."
    docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null || true

    # Wait for Postgres to be ready
    for i in {1..10}; do
      if docker compose exec -T postgres pg_isready -U recon > /dev/null 2>&1; then
        echo "✓ Postgres ready on localhost:5432"
        break
      fi
      sleep 1
    done
  else
    echo "⚠ Docker not installed. Expecting Postgres to be available via DATABASE_URL in .env."
  fi
fi

# 3. Check .env exists
if [ ! -f .env ]; then
  echo "→ No .env found, copying from .env.example..."
  cp .env.example .env
  echo "⚠ Edit .env to set your API keys (OUTSCRAPER_API_KEY, ANTHROPIC_API_KEY)"
fi

# 4. Start Next.js dev server (excluding the legacy local-scraper worker —
#    scraping now runs inline inside the tRPC mutation, no separate worker needed)
echo ""
echo "→ Starting Next.js on http://localhost:3000"
echo "  Mailpit UI:    http://localhost:8025 (if Docker is running)"
echo "  Ollama API:    http://localhost:11434/v1"
echo ""
exec pnpm --filter @recon/web dev
