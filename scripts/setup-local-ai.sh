#!/usr/bin/env bash
# RECON — Local AI setup (Ollama + Gemma)
# Run once: bash scripts/setup-local-ai.sh
set -e

echo "🧠 RECON Local AI Setup"
echo ""

# 1. Check / install Ollama
if ! command -v ollama &> /dev/null; then
  echo "→ Ollama not found. Installing via Homebrew..."
  if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew not found. Install from https://brew.sh first."
    exit 1
  fi
  brew install ollama
else
  echo "✓ Ollama already installed ($(ollama --version 2>/dev/null | head -1))"
fi

# 2. Start Ollama service (as a background daemon)
if ! pgrep -x "ollama" > /dev/null; then
  echo "→ Starting Ollama service in background..."
  brew services start ollama 2>/dev/null || nohup ollama serve > /tmp/ollama.log 2>&1 &
  sleep 3
fi

# Wait for Ollama to be ready
echo "→ Waiting for Ollama to be ready..."
for i in {1..15}; do
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✓ Ollama is running on http://localhost:11434"
    break
  fi
  sleep 1
done

# 3. Pull Gemma model (gemma3:4b is ~3GB)
MODEL="${OLLAMA_MODEL:-gemma3:4b}"
echo "→ Pulling model: $MODEL (this may take 2-5 minutes on first run)..."
ollama pull "$MODEL"

# 4. Quick smoke test
echo "→ Testing model..."
RESPONSE=$(curl -s http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Say OK\"}],\"max_tokens\":10}" \
  | head -c 200)

if echo "$RESPONSE" | grep -q "content"; then
  echo "✓ Model responding correctly"
else
  echo "⚠ Model test didn't return expected response. Check with: curl http://localhost:11434/api/tags"
  echo "  Response: $RESPONSE"
fi

echo ""
echo "✅ Local AI ready."
echo ""
echo "Next steps:"
echo "  1. Make sure your .env has:  OLLAMA_BASE_URL=\"http://localhost:11434/v1\""
echo "  2. Start the app:            pnpm dev:local"
echo ""
