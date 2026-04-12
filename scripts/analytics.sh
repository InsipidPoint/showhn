#!/bin/bash
# Umami analytics for all sites
# Usage: ./scripts/analytics.sh [site] [period]
# Sites: all (default), hn, shiwei, everglades, burin
# Periods: today, 24h (default), 7d, 30d

UMAMI_URL="http://127.0.0.1:3500"
source "$(dirname "$0")/.analytics.env"

declare -A SITES
SITES[hn]="82df6e49-8888-45de-8ea7-818be6d8bc12|HN Showcase"
SITES[shiwei]="23e2d4f2-3aab-46e9-ba28-7bf0f27519e1|shiweisong.com"
SITES[everglades]="2e9d8b89-82c9-4dff-ad0f-c1544e9e2623|Everglades"
SITES[burin]="83eaa67f-77e9-4107-8e56-ea95201ebe12|Burin"

SITE="${1:-all}"
PERIOD="${2:-24h}"

# Login
TOKEN=$(curl -s -X POST "$UMAMI_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$UMAMI_PASSWORD\"}" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "ERR: Login failed"
  exit 1
fi

NOW_MS=$(($(date +%s) * 1000))

case "$PERIOD" in
  today)  START_MS=$(($(date -d "today 00:00" +%s) * 1000)); LABEL="Today" ;;
  24h)    START_MS=$((NOW_MS - 86400000)); LABEL="Last 24 hours" ;;
  7d)     START_MS=$((NOW_MS - 604800000)); LABEL="Last 7 days" ;;
  30d)    START_MS=$((NOW_MS - 2592000000)); LABEL="Last 30 days" ;;
  *)      echo "Unknown period: $PERIOD (use today, 24h, 7d, 30d)"; exit 1 ;;
esac

pull_stats() {
  local WID="$1"
  local NAME="$2"

  STATS=$(curl -s "$UMAMI_URL/api/websites/$WID/stats?startAt=$START_MS&endAt=$NOW_MS" \
    -H "Authorization: Bearer $TOKEN")

  VISITORS=$(echo "$STATS" | jq -r '.visitors')
  VISITS=$(echo "$STATS" | jq -r '.visits')
  PAGEVIEWS=$(echo "$STATS" | jq -r '.pageviews')
  BOUNCES=$(echo "$STATS" | jq -r '.bounces')
  TOTALTIME=$(echo "$STATS" | jq -r '.totaltime')
  ACTIVE=$(curl -s "$UMAMI_URL/api/websites/$WID/active" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.visitors')

  if [ "$VISITS" -gt 0 ] 2>/dev/null; then
    BOUNCE_RATE=$(( (BOUNCES * 100) / VISITS ))
    AVG_TIME=$(( TOTALTIME / VISITS ))
  else
    BOUNCE_RATE=0
    AVG_TIME=0
  fi

  if [ "$SITE" = "all" ]; then
    printf "  %-18s %4s visitors | %4s views | bounce %s%% | active %s\n" \
      "$NAME" "$VISITORS" "$PAGEVIEWS" "$BOUNCE_RATE" "$ACTIVE"
  else
    echo "$NAME — $LABEL"
    echo "================================="
    printf "Visitors: %s | Visits: %s | Views: %s\n" "$VISITORS" "$VISITS" "$PAGEVIEWS"
    printf "Bounce: %s%% | Avg time: %ss | Active: %s\n" "$BOUNCE_RATE" "$AVG_TIME" "$ACTIVE"

    echo ""
    echo "Countries"
    curl -s "$UMAMI_URL/api/websites/$WID/metrics?startAt=$START_MS&endAt=$NOW_MS&type=country" \
      -H "Authorization: Bearer $TOKEN" | jq -r '.[] | "  \(.x): \(.y)"' 2>/dev/null | head -10

    echo ""
    echo "Referrers"
    curl -s "$UMAMI_URL/api/websites/$WID/metrics?startAt=$START_MS&endAt=$NOW_MS&type=referrer" \
      -H "Authorization: Bearer $TOKEN" | jq -r '.[] | "  \(.x): \(.y)"' 2>/dev/null | head -10

    echo ""
    echo "Top Pages"
    curl -s "$UMAMI_URL/api/websites/$WID/metrics?startAt=$START_MS&endAt=$NOW_MS&type=path" \
      -H "Authorization: Bearer $TOKEN" | jq -r '.[] | "  \(.x): \(.y)"' 2>/dev/null | head -10
  fi
}

if [ "$SITE" = "all" ]; then
  echo "All Sites — $LABEL"
  echo "================================="
  for key in hn shiwei everglades burin; do
    IFS='|' read -r WID NAME <<< "${SITES[$key]}"
    pull_stats "$WID" "$NAME"
  done
else
  if [ -z "${SITES[$SITE]}" ]; then
    echo "Unknown site: $SITE (use all, hn, shiwei, everglades, burin)"
    exit 1
  fi
  IFS='|' read -r WID NAME <<< "${SITES[$SITE]}"
  pull_stats "$WID" "$NAME"
fi
