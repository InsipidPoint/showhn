/**
 * Data refresh logic for stale post stats (points, comments).
 *
 * Layer 1 (cron): refreshStalePosts() — batched Algolia fetch, called from ingest.ts
 * Layer 2 (on-demand): triggerRefreshIfStale() — fire-and-forget single fetch on post detail view
 */

import { eq, sql } from "drizzle-orm";
import { posts } from "./db/schema";
import type { Post } from "./db/schema";
import { fetchItem, fetchItemsBatched } from "./hn-api";
import { createRateLimiter } from "./rate-limit";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

const ONE_HOUR = 60 * 60;
const ONE_DAY = 24 * ONE_HOUR;

/** On-demand cooldown: never refresh more often than once per hour */
const ON_DEMAND_COOLDOWN = 1 * ONE_HOUR;

/** Rate limiter for on-demand refresh in the web process: 30 requests/minute */
const onDemandLimiter = createRateLimiter({
  maxTokens: 30,
  refillRate: 30,
  refillIntervalMs: 60_000,
});

// --- Cron refresh (Layer 1) ---

/**
 * Query the DB for post IDs that are stale according to their age tier.
 * Only considers posts ≤ 30 days old. Returns IDs ordered most-stale-first.
 *
 * Tiers:
 *   < 24h old  → stale after 10 min
 *   1–3 days   → stale after 1h
 *   3–7 days   → stale after 6h
 *   7–30 days  → stale after 24h
 *   > 30 days  → skipped (on-demand only)
 */
export function getStalePostIds(database: BetterSQLite3Database, limit = 100): number[] {
  const now = Math.floor(Date.now() / 1000);

  const result = database.all<{ id: number }>(sql`
    SELECT id FROM posts
    WHERE created_at >= ${now - 30 * ONE_DAY}
      AND (
        (${now} - created_at < ${1 * ONE_DAY} AND updated_at < ${now - 10 * 60})
        OR (${now} - created_at >= ${1 * ONE_DAY} AND ${now} - created_at < ${3 * ONE_DAY} AND updated_at < ${now - 1 * ONE_HOUR})
        OR (${now} - created_at >= ${3 * ONE_DAY} AND ${now} - created_at < ${7 * ONE_DAY} AND updated_at < ${now - 6 * ONE_HOUR})
        OR (${now} - created_at >= ${7 * ONE_DAY} AND updated_at < ${now - 24 * ONE_HOUR})
      )
    ORDER BY updated_at ASC
    LIMIT ${limit}
  `);

  return result.map((r) => r.id);
}

/**
 * Fetch fresh stats for stale posts via batched Algolia queries and update the DB.
 * Called from ingest.ts after the Algolia discovery pass.
 */
export async function refreshStalePosts(
  database: BetterSQLite3Database,
  limit = 100,
): Promise<{ refreshed: number }> {
  const staleIds = getStalePostIds(database, limit);
  if (staleIds.length === 0) return { refreshed: 0 };

  console.log(`[refresh] Found ${staleIds.length} stale posts to refresh`);

  const hits = await fetchItemsBatched(staleIds);
  const now = Math.floor(Date.now() / 1000);
  let refreshed = 0;

  for (const hit of hits) {
    const id = parseInt(hit.objectID, 10);
    database
      .update(posts)
      .set({
        points: hit.points,
        comments: hit.num_comments,
        updatedAt: now,
      })
      .where(eq(posts.id, id))
      .run();
    refreshed++;
  }

  console.log(`[refresh] Updated ${refreshed} posts`);
  return { refreshed };
}

// --- On-demand refresh (Layer 2) ---

/**
 * Fire-and-forget: if the post is stale (updatedAt > 1 hour ago) and the
 * rate limiter allows it, fetch fresh stats from HN Firebase API and update DB.
 *
 * Non-blocking — call without await. The current page render uses existing DB data;
 * the next visitor sees the updated counts.
 */
export function triggerRefreshIfStale(post: Post): void {
  const now = Math.floor(Date.now() / 1000);
  const age = now - (post.updatedAt ?? 0);

  if (age < ON_DEMAND_COOLDOWN) return;
  if (!onDemandLimiter.tryConsume()) return;

  refreshPostOnDemand(post.id).catch(() => {
    // Silently swallow errors — this is best-effort
  });
}

async function refreshPostOnDemand(id: number): Promise<void> {
  const item = await fetchItem(id);
  if (!item) return;

  const { db } = await import("./db/index");
  const now = Math.floor(Date.now() / 1000);

  db.update(posts)
    .set({
      points: item.score,
      comments: item.descendants,
      updatedAt: now,
    })
    .where(eq(posts.id, id))
    .run();
}
