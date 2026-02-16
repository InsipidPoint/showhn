#!/usr/bin/env bash
# Cron jobs for HN Showcase data pipeline
# Add to crontab: crontab -e
#
# Suggested schedule:
#   */30 * * * *  /path/to/deploy/cron.sh ingest
#   0 */4 * * *   /path/to/deploy/cron.sh screenshots
#   0 */6 * * *   /path/to/deploy/cron.sh analyze
#   0 3 * * *     /path/to/deploy/cron.sh fts

set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/root"

APP_DIR="$(cd "$(dirname "$0")/../app" && pwd)"
LOG_DIR="$APP_DIR/../logs"
mkdir -p "$LOG_DIR"

# Source env vars for API keys
[ -f "$APP_DIR/.env.local" ] && export $(grep -v '^#' "$APP_DIR/.env.local" | xargs)

cd "$APP_DIR"

case "${1:-}" in
  ingest)
    npx tsx scripts/ingest.ts >> "$LOG_DIR/ingest.log" 2>&1
    ;;
  screenshots)
    npx tsx scripts/screenshot.ts --limit 30 >> "$LOG_DIR/screenshots.log" 2>&1
    ;;
  analyze)
    npx tsx scripts/analyze.ts --limit 30 >> "$LOG_DIR/analyze.log" 2>&1
    ;;
  fts)
    npx tsx scripts/setup-fts.ts >> "$LOG_DIR/fts.log" 2>&1
    ;;
  all)
    npx tsx scripts/ingest.ts >> "$LOG_DIR/ingest.log" 2>&1
    npx tsx scripts/screenshot.ts --limit 30 >> "$LOG_DIR/screenshots.log" 2>&1
    npx tsx scripts/analyze.ts --limit 30 >> "$LOG_DIR/analyze.log" 2>&1
    npx tsx scripts/setup-fts.ts >> "$LOG_DIR/fts.log" 2>&1
    ;;
  *)
    echo "Usage: $0 {ingest|screenshots|analyze|fts|all}"
    exit 1
    ;;
esac
