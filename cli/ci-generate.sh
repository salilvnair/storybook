#!/usr/bin/env bash
# iStorybook CI Recipe — S38.03
# Generate a book in a CI pipeline (GitHub Actions / GitLab CI / Jenkins).
#
# Usage:
#   export ISTORYBOOK_URL=http://your-server:8787
#   export ISTORYBOOK_API_KEY=isbk-xxxx
#   ./ci-generate.sh "A brave bunny learns to share" ./output/bunny-story.pdf
#
# Required env:
#   ISTORYBOOK_URL      — server URL
#   ISTORYBOOK_API_KEY  — API key (if configured)
#
# Optional env:
#   STORY_PAGES=5       — number of pages (default: 5)
#   STORY_STYLE=        — art style (e.g. "watercolour")
#   POLL_INTERVAL=5     — seconds between status polls
#   TIMEOUT=300         — seconds before giving up

set -euo pipefail

PROMPT="${1:-A brave bunny learns to share}"
OUT_PDF="${2:-./storybook.pdf}"
PAGES="${STORY_PAGES:-5}"
STYLE="${STORY_STYLE:-}"
INTERVAL="${POLL_INTERVAL:-5}"
TIMEOUT="${TIMEOUT:-300}"
BASE_URL="${ISTORYBOOK_URL:-http://localhost:8787}"
API_KEY="${ISTORYBOOK_API_KEY:-}"

H_CONTENT="Content-Type: application/json"
H_KEY=""
[[ -n "$API_KEY" ]] && H_KEY="x-api-key: $API_KEY"

echo "📖 iStorybook CI — generating story"
echo "   Prompt : $PROMPT"
echo "   Pages  : $PAGES"
echo "   Output : $OUT_PDF"
echo ""

# 1. Create story job
BODY=$(jq -n --arg p "$PROMPT" --argjson pages "$PAGES" --arg style "$STYLE" '{prompt:$p,pageCount:$pages,artStyle:$style}')
JOB=$(curl -sf -X POST "$BASE_URL/api/v1/story/create" \
  -H "$H_CONTENT" ${H_KEY:+-H "$H_KEY"} \
  -d "$BODY")

JOB_ID=$(echo "$JOB" | jq -r '.jobId')
echo "✅ Job started: $JOB_ID"

# 2. Poll until done
ELAPSED=0
while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
  STATUS=$(curl -sf "$BASE_URL/api/v1/story/$JOB_ID/status" ${H_KEY:+-H "$H_KEY"})
  STATE=$(echo "$STATUS" | jq -r '.status')
  echo "   Status: $STATE (${ELAPSED}s)"
  if [ "$STATE" = "done" ]; then
    STORY_ID=$(echo "$STATUS" | jq -r '.storyId')
    echo "✅ Done! Story ID: $STORY_ID"
    break
  fi
  if [ "$STATE" = "error" ]; then
    ERR=$(echo "$STATUS" | jq -r '.error')
    echo "❌ Generation failed: $ERR"
    exit 1
  fi
done

if [ -z "${STORY_ID:-}" ]; then
  echo "❌ Timed out after ${TIMEOUT}s"
  exit 1
fi

# 3. Download PDF
echo "⬇  Downloading PDF → $OUT_PDF"
mkdir -p "$(dirname "$OUT_PDF")"
curl -sf "$BASE_URL/api/v1/story/$STORY_ID/pdf" ${H_KEY:+-H "$H_KEY"} -o "$OUT_PDF"
SIZE=$(wc -c < "$OUT_PDF" | tr -d ' ')
echo "✅ PDF saved: $OUT_PDF (${SIZE} bytes)"

# 4. Optional: upload to artifact store
if [ -n "${ARTIFACT_URL:-}" ]; then
  echo "📤 Uploading to artifact store…"
  curl -sf -X PUT "$ARTIFACT_URL" -T "$OUT_PDF"
  echo "✅ Uploaded"
fi
