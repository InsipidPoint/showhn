#!/bin/bash
# Analyze the corpus to find generic terms for the FTS stopword list.
# Run periodically (e.g. every few months) as the post corpus grows.
#
# Method: For each word in titles+summaries, count how many distinct AI categories
# it appears in. Terms appearing in 15+ of 16 categories are "generic" — they
# don't help distinguish similar projects. Terms in fewer categories carry topical
# signal and should NOT be stopwords.
#
# Usage: ./scripts/analyze-stopwords.sh
# Output: sorted list of generic terms, plus a diff against the current stopword list.

DB="$(dirname "$0")/../app/data/showhn.db"
SRC="$(dirname "$0")/../app/src/lib/db/queries.ts"

if [ ! -f "$DB" ]; then
  echo "ERR: Database not found at $DB"
  exit 1
fi

THRESHOLD=15  # out of 16 categories

echo "Analyzing $(sqlite3 "$DB" "SELECT COUNT(*) FROM posts WHERE status='active'") active posts..."
echo "Finding terms that appear in $THRESHOLD+ of 16 categories..."
echo ""

# Extract all (category, word) pairs, deduplicate per category, count categories per word
GENERIC_TERMS=$(sqlite3 "$DB" "
SELECT a.category, lower(p.title) || ' ' || lower(COALESCE(a.summary,''))
FROM posts p
JOIN ai_analysis a ON p.id = a.post_id
WHERE p.status = 'active' AND a.category IS NOT NULL
" | while IFS='|' read cat txt; do
  echo "$txt" | tr -cs '[:alpha:]' '\n' | grep -E '^.{3,}$' | sort -u | while read word; do
    echo "$cat|$word"
  done
done | sort -u | cut -d'|' -f2 | sort | uniq -c | awk -v t="$THRESHOLD" '$1 >= t' | awk '{print $2}' | sort)

GENERIC_COUNT=$(echo "$GENERIC_TERMS" | wc -l)
echo "Found $GENERIC_COUNT terms appearing in $THRESHOLD+ categories."
echo ""

# Extract current stopwords from source
CURRENT=$(grep -oP '"[a-z]+"' "$SRC" | tr -d '"' | sort -u)

# Diff
MISSING=$(comm -23 <(echo "$GENERIC_TERMS") <(echo "$CURRENT"))
EXTRA=$(comm -13 <(echo "$GENERIC_TERMS") <(echo "$CURRENT"))

echo "=== MISSING from stopwords (generic terms not yet filtered) ==="
echo "$MISSING" | grep -E '^.{3,}$' | while read w; do
  echo "  $w"
done
echo ""

MISSING_COUNT=$(echo "$MISSING" | grep -cE '^.{3,}$')
echo "Total missing: $MISSING_COUNT"
echo ""

echo "=== Currently in stopwords but NOT in generic corpus list ==="
echo "(These may still be valid stopwords — English stopwords, adjectives, etc.)"
echo "$EXTRA" | grep -E '^.{3,}$' | head -30
echo "... ($(echo "$EXTRA" | grep -cE '^.{3,}$') total)"
echo ""

echo "=== Full generic terms list (copy to update STOPWORDS) ==="
echo "$GENERIC_TERMS"
