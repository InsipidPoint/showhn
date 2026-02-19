/**
 * Parallel rescore — vision mode with concurrency control.
 * Uses stored page_content + readme_content + screenshots.
 * Safe for 500 RPM OpenAI rate limit.
 *
 * Usage:
 *   npx tsx scripts/rescore-parallel.ts                    # all posts, 8 workers
 *   npx tsx scripts/rescore-parallel.ts --concurrency 5    # 5 workers
 *   npx tsx scripts/rescore-parallel.ts --limit 100        # first 100 posts
 *   npx tsx scripts/rescore-parallel.ts --dry-run          # preview only
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { analyzePost, tierToPickScore, parseTier, parseVibeTags, TIERS, type Tier } from "../src/lib/ai/llm";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });

const SCREENSHOT_DIR = path.join(process.cwd(), "public", "screenshots");

// Migration: add new columns if missing
try { sqlite.exec(`ALTER TABLE ai_analysis ADD COLUMN tier TEXT`); } catch { /* exists */ }
try { sqlite.exec(`ALTER TABLE ai_analysis ADD COLUMN vibe_tags TEXT`); } catch { /* exists */ }

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: { limit?: number; dryRun: boolean; concurrency: number } = {
    dryRun: false,
    concurrency: 8,
  };
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--limit" && args[i + 1]) {
      flags.limit = parseInt(args[++i], 10);
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      flags.concurrency = parseInt(args[++i], 10);
    } else if (args[i] === "--dry-run") {
      flags.dryRun = true;
    }
    i++;
  }
  return flags;
}

type PostRow = {
  id: number;
  title: string;
  url: string | null;
  story_text: string | null;
  page_content: string | null;
  readme_content: string | null;
  summary: string | null;
  pick_reason: string | null;
};

function loadScreenshot(postId: number): string | undefined {
  for (const ext of ["webp", "png"]) {
    const p = path.join(SCREENSHOT_DIR, `${postId}.${ext}`);
    if (fs.existsSync(p)) return fs.readFileSync(p).toString("base64");
  }
  return undefined;
}

// Per-worker rate limit: 1 call per 1s minimum → 8 workers × 1/s = 8 RPS = 480 RPM
const WORKER_DELAY = 1000;

async function main() {
  const flags = parseArgs();

  let query = `
    SELECT p.id, p.title, p.url, p.story_text, p.page_content, p.readme_content,
           a.summary, a.pick_reason
    FROM posts p
    JOIN ai_analysis a ON a.post_id = p.id
    WHERE p.status = 'active'
    ORDER BY p.id DESC
  `;
  const params: unknown[] = [];
  if (flags.limit) {
    query += " LIMIT ?";
    params.push(flags.limit);
  }

  const posts = sqlite.prepare(query).all(...params) as PostRow[];

  console.log(`[rescore-parallel] ${posts.length} posts, ${flags.concurrency} workers, vision mode`);
  console.log(`[rescore-parallel] Rate: ~${flags.concurrency} calls/sec (${flags.concurrency * 60} RPM max)`);
  if (flags.dryRun) console.log("[rescore-parallel] DRY RUN — no writes");

  const startTime = Date.now();
  let idx = 0;
  let processed = 0;
  let errors = 0;
  const tierCounts: Record<string, number> = {};

  const updateStmt = sqlite.prepare(`
    UPDATE ai_analysis SET
      tier = ?, vibe_tags = ?, pick_reason = ?, pick_score = ?,
      analyzed_at = ?, model = ?
    WHERE post_id = ?
  `);

  async function worker(workerId: number) {
    while (idx < posts.length) {
      const i = idx++;
      const post = posts[i];
      const label = `[${i + 1}/${posts.length}]`;

      try {
        const screenshotBase64 = loadScreenshot(post.id);
        const pageContent = post.page_content || post.summary || post.story_text?.replace(/<[^>]*>/g, " ").slice(0, 3000) || post.title;

        const { result, model } = await analyzePost(
          post.title,
          post.url,
          pageContent,
          post.story_text,
          post.readme_content || undefined,
          screenshotBase64
        );

        const pickScore = tierToPickScore(result.tier);
        tierCounts[result.tier] = (tierCounts[result.tier] || 0) + 1;

        const hasScreenshot = !!screenshotBase64;
        const vibeStr = result.vibe_tags.length > 0 ? ` [${result.vibe_tags.join(", ")}]` : "";

        if (!flags.dryRun) {
          updateStmt.run(
            result.tier,
            JSON.stringify(result.vibe_tags),
            result.highlight || post.pick_reason || "",
            pickScore,
            Math.floor(Date.now() / 1000),
            model,
            post.id
          );
        }

        processed++;
        console.log(`  ${label} ${flags.dryRun ? "[dry]" : "✓"} ${post.id} | ${result.tier.toUpperCase().padEnd(6)}${hasScreenshot ? " 📸" : "   "}${vibeStr} | ${post.title.substring(0, 50)}`);
      } catch (err) {
        errors++;
        console.error(`  ${label} ✗ ${post.id}: ${(err as Error).message}`);
      }

      // Rate limit per worker
      await new Promise((r) => setTimeout(r, WORKER_DELAY));
    }
  }

  const workers = Array.from(
    { length: Math.min(flags.concurrency, posts.length) },
    (_, i) => worker(i)
  );
  await Promise.all(workers);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[rescore-parallel] Done in ${elapsed}s. ${processed} scored, ${errors} errors.`);

  console.log("\nTier distribution:");
  for (const tier of TIERS) {
    const count = tierCounts[tier] || 0;
    const pct = processed > 0 ? ((count / processed) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round(count / 5));
    console.log(`  ${tier.toUpperCase().padEnd(6)}: ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  }
}

main().catch((err) => {
  console.error("[rescore-parallel] Fatal:", err);
  process.exit(1);
});
