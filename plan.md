# Data Refresh Strategy: Comments & Vote Counts

## Problem

After a post is ingested and falls outside the 2-hour Algolia lookback window, its `points` and `comments` fields never get updated again. HN posts can accumulate votes and comments for days. Users see stale counts on both the gallery and detail pages.

## Current State

- **Cron (`*/30 * * * *`)**: Runs `ingest.ts`, fetches Show HN posts from the last 2 hours via Algolia, upserts points/comments for any posts found.
- **No targeted refresh**: Once a post ages past the 2-hour window, its stats freeze.
- **`updatedAt` field exists**: Already tracks when a post was last updated — we can use this as the staleness marker.
- **Pages use `force-dynamic`**: Every page request hits SQLite directly, so DB updates are immediately visible.

## Proposed Architecture: Two-Layer Refresh

### Layer 1: Piggyback on Existing Ingest Cron (`scripts/ingest.ts`)

No new cron job. After the existing Algolia ingest completes, run a refresh pass for stale posts ≤ 30 days old using the HN Firebase API.

**Age-based refresh tiers (for cron refresh):**

| Post Age       | Staleness Threshold | Rationale                                    |
|----------------|---------------------|----------------------------------------------|
| < 24 hours     | 10 minutes          | Most active period, votes/comments fly       |
| 1–3 days       | 1 hour              | Still accumulating, but slowing              |
| 3–7 days       | 6 hours             | Tail-end activity                            |
| 7–30 days      | 24 hours            | Minimal change, occasional late comments     |
| > 30 days      | Skip (on-demand only)| Effectively frozen — only refresh if viewed  |

**Data source**: Official HN Firebase API (`https://hacker-news.firebaseio.com/v0/item/{id}.json`) — lets us fetch specific post IDs. Returns `{ id, score, descendants, ... }`.

**Flow** (appended to end of `ingest.ts`):
1. After Algolia ingest finishes, query DB for posts ≤ 30 days old where `(now - updatedAt) > staleness_threshold` for their age tier
2. Cap at ~100 posts per run to keep runtime reasonable
3. Fetch each from HN API with 200ms delay between requests
4. Update `points`, `comments`, and `updatedAt` in the DB
5. Log refresh stats

Since the cron already runs every 30 minutes, this is frequent enough for all tiers. At 100 posts max with 200ms delays, the refresh pass adds ~20 seconds to the existing cron run.

### Layer 2: Non-Blocking On-Demand Refresh on Post Detail View

When a user visits `/post/[id]/[slug]`, check if data is stale. If so, **fire and forget** a background refresh — don't block page rendering. The user sees current DB data immediately; the next visitor (or a page reload) sees the updated counts.

**Flow:**
1. `getPost(id)` fetches from DB and renders the page immediately
2. After getting the post, call `triggerRefreshIfStale(post)` — a fire-and-forget async function
3. If stale → fetches from HN API in the background, updates DB silently
4. If fresh → does nothing

**Staleness rule for on-demand**: A post is stale if `updatedAt` is more than **1 hour** ago. Simple, universal — no age tiers needed here since this is just a supplementary mechanism for posts users are actively viewing.

**Safeguards against over-fetching:**
- **1-hour minimum cooldown**: Won't re-fetch a post if `updatedAt` is < 1 hour old (inherent in the staleness check against DB)
- **In-memory rate limiter**: Token bucket limiting total HN API calls from the web process to ~30/minute. If exhausted, silently skip — no error, no delay.
- **3-second timeout**: If HN API is slow, the background fetch aborts. Page was already rendered anyway.
- **Post detail only**: No on-demand refresh on gallery/list pages. Those serve dozens of posts — the cron handles bulk freshness.
- **Posts > 30 days**: This is their *only* refresh path. They won't be refreshed by cron, but if someone views them, they'll get a background update (still respecting the 1-hour cooldown).

### Why Not Algolia for Refresh?

- Algolia is search-based — you can't efficiently say "give me updated data for these 50 post IDs"
- The HN Firebase API is designed for per-item lookups and has generous rate limits
- Algolia is still used for discovery (new post ingestion), Firebase for targeted refresh

## Implementation Plan

### New Files

#### 1. `src/lib/hn-api.ts` — HN Firebase API client

```typescript
// Thin wrapper around HN Firebase API
fetchItem(id: number): Promise<HNItem | null>
  // GET https://hacker-news.firebaseio.com/v0/item/{id}.json
  // 3-second timeout, returns null on error

fetchItems(ids: number[], delayMs = 200): AsyncGenerator<HNItem>
  // Yields items one at a time with delay between requests
```

#### 2. `src/lib/refresh.ts` — Refresh logic (shared by cron and on-demand)

```typescript
getStalenessThreshold(postAgeSeconds: number): number
  // Maps post age → staleness threshold from tier table

getStalePostIds(db, limit = 100): number[]
  // Query posts ≤ 30 days old where (now - updatedAt) > threshold
  // Ordered by most stale first

refreshPost(db, id: number): Promise<boolean>
  // Fetch from HN API, update points/comments/updatedAt
  // Returns true if updated

refreshStalePosts(db, limit = 100): Promise<{ refreshed: number }>
  // Orchestrator: get stale IDs, fetch in sequence with 200ms delay
  // Used by ingest.ts after Algolia pass

triggerRefreshIfStale(post: Post): void
  // Fire-and-forget: check staleness (1-hour threshold), check rate limit,
  // kick off background fetch. No await, no blocking.
  // Used by post detail page
```

#### 3. `src/lib/rate-limit.ts` — Simple in-memory token bucket

```typescript
createRateLimiter({ maxTokens: 30, refillRate: 30, refillIntervalMs: 60_000 })
  // 30 tokens, refills 30 per minute

limiter.tryConsume(): boolean
  // Returns true if a token was available, false if exhausted
```

### Modified Files

#### 4. `scripts/ingest.ts` — Append refresh pass after Algolia ingest

```diff
  // At the end of ingest(), after Algolia fetch loop:
+ // Refresh stale posts via HN API
+ const { refreshed } = await refreshStalePosts(db);
+ console.log(`[ingest] Refreshed ${refreshed} stale posts.`);
```

#### 5. `src/app/post/[id]/[slug]/page.tsx` — Fire-and-forget refresh

```diff
  const post = await getPost(parseInt(id, 10));
  if (!post) notFound();
+ triggerRefreshIfStale(post);  // non-blocking, fire-and-forget
```

#### 6. `deploy/cron.sh` — No changes needed

The existing `*/30 * * * *` cron schedule stays the same. The refresh logic is built into `ingest.ts` now.

## What This Does NOT Change

- **Cron schedule**: Still `*/30 * * * *`, no new cron entries
- **Worker/task queue**: No changes. Screenshots and AI analysis unaffected.
- **Gallery pages**: No on-demand refresh on list views. They benefit from the cron refresh passively.
- **Schema**: No migrations needed. `updatedAt`, `points`, `comments` columns already exist.

## Summary

```
                    ┌─────────────────────┐
                    │   Algolia HN API    │
                    │  (new post search)  │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │  ingest.ts (*/30)   │
                    │                     │
                    │  1. Algolia fetch   │   Discovery + Refresh
                    │     (existing)      │   in one cron job
                    │                     │
                    │  2. HN API refresh  │
                    │     (≤30 day posts) │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │     SQLite DB       │
                    │  posts.points       │
                    │  posts.comments     │
                    │  posts.updatedAt    │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────────┐
                    │  Post detail page       │
                    │                         │
                    │  Render immediately     │
                    │  from DB (no blocking)  │
                    │                         │
                    │  triggerRefreshIfStale() │
                    │  → fire & forget        │   On-demand (background)
                    │  → 1-hour cooldown      │   Rate-limited, non-blocking
                    │  → rate limited         │   Only path for >30 day posts
                    │  → updates DB for       │
                    │    next visitor          │
                    └─────────────────────────┘
```
