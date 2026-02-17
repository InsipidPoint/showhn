/**
 * HN API clients for data refresh.
 *
 * - fetchItem: Single item via HN Firebase API (for on-demand refresh)
 * - fetchItemsBatched: Multiple items via Algolia objectID filter (for cron refresh)
 */

const HN_FIREBASE_BASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA_SEARCH_BASE = "https://hn.algolia.com/api/v1/search";

export interface HNItem {
  id: number;
  score: number;
  descendants: number; // comment count
  dead?: boolean;
  deleted?: boolean;
}

export interface AlgoliaRefreshHit {
  objectID: string;
  points: number;
  num_comments: number;
}

/**
 * Fetch a single item from HN Firebase API.
 * Used by on-demand refresh (single post detail view).
 */
export async function fetchItem(id: number): Promise<HNItem | null> {
  try {
    const res = await fetch(`${HN_FIREBASE_BASE}/item/${id}.json`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.deleted || data.dead) return null;
    return {
      id: data.id,
      score: data.score ?? 0,
      descendants: data.descendants ?? 0,
      dead: data.dead,
      deleted: data.deleted,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch multiple items via Algolia objectID filter in batches.
 * Used by cron refresh to update stale posts efficiently.
 *
 * Chunks IDs into groups of `batchSize`, fetches each batch with a single
 * Algolia request using `filters=objectID:X OR objectID:Y ...`,
 * with `delayMs` pause between batches.
 */
export async function fetchItemsBatched(
  ids: number[],
  batchSize = 20,
  delayMs = 200,
): Promise<AlgoliaRefreshHit[]> {
  if (ids.length === 0) return [];

  const results: AlgoliaRefreshHit[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const filterStr = chunk.map((id) => `objectID:${id}`).join(" OR ");

    try {
      const params = new URLSearchParams({
        tags: "show_hn",
        filters: filterStr,
        hitsPerPage: String(batchSize),
        attributesToRetrieve: "objectID,points,num_comments",
      });
      const res = await fetch(`${ALGOLIA_SEARCH_BASE}?${params}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        for (const hit of data.hits ?? []) {
          results.push({
            objectID: hit.objectID,
            points: hit.points ?? 0,
            num_comments: hit.num_comments ?? 0,
          });
        }
      }
    } catch {
      // Skip failed batch, continue with rest
    }

    // Delay between batches (skip after last batch)
    if (i + batchSize < ids.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
