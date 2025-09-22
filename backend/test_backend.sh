#!/usr/bin/env bash
set -euo pipefail

# Simple end-to-end tester for the image generation backend with verbose logs.
# Usage:
#   BACKEND_URL=http://localhost:3000 ./test_backend.sh 5
# or
#   ./test_backend.sh            # defaults to 3 images and http://localhost:3000

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
NUM_IMAGES="${1:-3}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
DOWNLOAD_DIR="$SCRIPT_DIR/downloads"
BASE_DIR="$SCRIPT_DIR/base-pfp"
mkdir -p "$LOG_DIR" "$DOWNLOAD_DIR"
LOG_FILE="$LOG_DIR/test_$(date +%Y%m%d_%H%M%S).log"

log() { echo "[$(date +'%F %T')] $*" | tee -a "$LOG_FILE"; }

die() { log "ERROR: $*"; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

pretty() { if have jq; then jq .; else cat; fi; }

log "Using BACKEND_URL=$BACKEND_URL"
log "Writing logs to $LOG_FILE"

# Check base image presence (optional but helpful)
if ! find "$BASE_DIR" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | head -n1 | grep -q .; then
  log "WARNING: No base image found in $BASE_DIR"
  log "Place one image (png/jpg/jpeg/webp) in $BASE_DIR before generating."
fi

# 1) Health check (verbose to log, then pretty print)
log "Health check (verbose)"
curl -v -sS "$BACKEND_URL/health" \
  -w '\n[HTTP_STATUS:%{http_code}]\n' 2>&1 | tee -a "$LOG_FILE"

log "Health check (pretty)"
health_json="$(curl -sS "$BACKEND_URL/health" || true)"
if [[ -n "$health_json" ]]; then
  echo "$health_json" | pretty | tee -a "$LOG_FILE" >/dev/null
else
  die "Health endpoint returned empty response"
fi

# 2) Generate images from local base
log "Requesting generation of $NUM_IMAGES image(s) from base folder (verbose)"
curl -v -sS -X POST "$BACKEND_URL/generate-from-base" \
  -H 'Content-Type: application/json' \
  -d "{\"numImages\":$NUM_IMAGES}" \
  -w '\n[HTTP_STATUS:%{http_code}]\n' 2>&1 | tee -a "$LOG_FILE"

log "Generation result (pretty)"
gen_json="$(curl -sS -X POST "$BACKEND_URL/generate-from-base" -H 'Content-Type: application/json' -d "{\"numImages\":$NUM_IMAGES}" || true)"
if [[ -n "$gen_json" ]]; then
  echo "$gen_json" | pretty | tee -a "$LOG_FILE" >/dev/null
else
  die "Generation endpoint returned empty response"
fi

# 3) List images
log "Listing images (verbose)"
curl -v -sS "$BACKEND_URL/images" \
  -w '\n[HTTP_STATUS:%{http_code}]\n' 2>&1 | tee -a "$LOG_FILE"

log "Images list (pretty)"
list_json="$(curl -sS "$BACKEND_URL/images" || true)"
if [[ -z "$list_json" ]]; then
  die "/images returned empty response"
fi

if have jq; then
  echo "$list_json" | jq . | tee -a "$LOG_FILE" >/dev/null
  FIRST_FILE="$(echo "$list_json" | jq -r '.images[0].filename // empty')"
else
  echo "$list_json" | tee -a "$LOG_FILE" >/dev/null
  # Fallback extraction of first filename when jq is unavailable
  FIRST_FILE="$(echo "$list_json" | grep -o '"filename"\s*:\s*"[^"]\+"' | head -n1 | sed -E 's/.*:\s*"([^"]+)"/\1/')"
fi

if [[ -z "${FIRST_FILE:-}" ]]; then
  die "No images found to download."
fi

# 4) Download first image
OUT_FILE="$DOWNLOAD_DIR/$FIRST_FILE"
log "Downloading first image: $FIRST_FILE -> $OUT_FILE"
curl -sS -o "$OUT_FILE" "$BACKEND_URL/images/$FIRST_FILE" || die "Download failed"

if [[ -s "$OUT_FILE" ]]; then
  SIZE_BYTES=$(stat -c %s "$OUT_FILE" 2>/dev/null || wc -c < "$OUT_FILE")
  log "Downloaded file size: ${SIZE_BYTES} bytes"
else
  die "Downloaded file is empty"
fi

# 5) Try to open in default viewer (best effort)
if have xdg-open; then
  log "Opening in default viewer: $BACKEND_URL/images/$FIRST_FILE"
  xdg-open "$BACKEND_URL/images/$FIRST_FILE" >/dev/null 2>&1 || true
fi

log "Done."