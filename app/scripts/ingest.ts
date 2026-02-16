/**
 * Ingests Show HN posts from the Algolia HN API into SQLite.
 * Run: npx tsx scripts/ingest.ts
 * Cron: run hourly to pick up new posts.
 * Pass --backfill to fetch the last 30 days.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

const ALGOLIA_BASE = "https://hn.algolia.com/api/v1/search_by_date";
const HITS_PER_PAGE = 100;

interface AlgoliaHit {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at_i: number;
  story_text: string | null;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
  nbPages: number;
  page: number;
}

async function fetchPage(page: number, startTimestamp?: number): Promise<AlgoliaResponse> {
  const params = new URLSearchParams({
    tags: "show_hn",
    hitsPerPage: String(HITS_PER_PAGE),
    page: String(page),
  });
  if (startTimestamp) {
    params.set("numericFilters", `created_at_i>${startTimestamp}`);
  }

  const url = `${ALGOLIA_BASE}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Algolia API error: ${res.status}`);
  return res.json();
}

function upsertPost(hit: AlgoliaHit) {
  const now = Math.floor(Date.now() / 1000);
  const id = parseInt(hit.objectID, 10);

  const existing = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();

  if (existing) {
    // Update points/comments only
    db.update(schema.posts)
      .set({
        points: hit.points,
        comments: hit.num_comments,
        updatedAt: now,
      })
      .where(eq(schema.posts.id, id))
      .run();
  } else {
    db.insert(schema.posts)
      .values({
        id,
        title: hit.title,
        url: hit.url || null,
        author: hit.author,
        points: hit.points,
        comments: hit.num_comments,
        createdAt: hit.created_at_i,
        storyText: hit.story_text || null,
        hasScreenshot: 0,
        status: hit.url ? "active" : "no_url",
        fetchedAt: now,
        updatedAt: now,
      })
      .run();
  }

  return !existing;
}

async function ingest(backfill = false) {
  // For backfill: go back 30 days. For hourly: go back 2 hours (with overlap).
  const lookbackSeconds = backfill ? 30 * 24 * 60 * 60 : 2 * 60 * 60;
  const startTimestamp = Math.floor(Date.now() / 1000) - lookbackSeconds;

  console.log(
    `[ingest] Starting ${backfill ? "backfill (30 days)" : "hourly"} ingestion...`
  );
  console.log(`[ingest] Fetching posts since ${new Date(startTimestamp * 1000).toISOString()}`);

  let page = 0;
  let totalFetched = 0;
  let newPosts = 0;

  while (true) {
    const data = await fetchPage(page, startTimestamp);
    if (data.hits.length === 0) break;

    for (const hit of data.hits) {
      const isNew = upsertPost(hit);
      if (isNew) newPosts++;
      totalFetched++;
    }

    console.log(`[ingest] Page ${page + 1}: ${data.hits.length} hits (${newPosts} new so far)`);

    page++;
    if (page >= data.nbPages) break;

    // Rate limit: be nice to Algolia
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[ingest] Done. Fetched ${totalFetched} posts, ${newPosts} new.`);
}

const isBackfill = process.argv.includes("--backfill");
ingest(isBackfill).catch((err) => {
  console.error("[ingest] Fatal error:", err);
  process.exit(1);
});
