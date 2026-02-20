/**
 * Re-score existing posts using batch analysis — the single judging function.
 * Always uses the same prompt as the worker (from llm.ts). Supports parallelism
 * and screenshots for consistent scoring. Processes posts in batches of BATCH_SIZE.
 *
 * Usage:
 *   npx tsx scripts/rescore.ts                        # all posts, 1 worker
 *   npx tsx scripts/rescore.ts --concurrency 4        # 4 parallel workers (4 batches at once)
 *   npx tsx scripts/rescore.ts --limit 30             # first 30 posts
 *   npx tsx scripts/rescore.ts --post 123 456         # specific post IDs
 *   npx tsx scripts/rescore.ts --dry-run              # preview without writing
 */

import Database from "better-sqlite3";
import { analyzeBatch, tierToPickScore, TIERS, type BatchPost } from "../src/lib/ai/llm";
import { loadScreenshot } from "../src/lib/fetchers";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "5", 10);

type PostRow = {
  id: number;
  title: string;
  url: string | null;
  story_text: string | null;
  page_content: string | null;
  readme_content: string | null;
  pick_reason: string | null;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: { limit?: number; postIds?: number[]; dryRun: boolean; concurrency: number } = {
    dryRun: false,
    concurrency: 1,
  };
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--limit" && args[i + 1]) {
      flags.limit = parseInt(args[++i], 10);
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      flags.concurrency = parseInt(args[++i], 10);
    } else if (args[i] === "--post") {
      flags.postIds = [];
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags.postIds.push(parseInt(args[++i], 10));
      }
    } else if (args[i] === "--dry-run") {
      flags.dryRun = true;
    }
    i++;
  }
  return flags;
}

// Per-worker rate limit: delay between batch calls
const WORKER_DELAY = parseInt(process.env.RESCORE_DELAY || "1000", 10);

const updateStmt = sqlite.prepare(`
  UPDATE ai_analysis SET
    summary = ?, category = ?, target_audience = ?,
    tier = ?, vibe_tags = ?, pick_reason = ?, pick_score = ?,
    strengths = ?, weaknesses = ?, similar_to = ?,
    analyzed_at = ?, model = ?
  WHERE post_id = ?
`);

async function main() {
  const flags = parseArgs();

  let query = `
    SELECT p.id, p.title, p.url, p.story_text, p.page_content, p.readme_content,
           a.pick_reason
    FROM posts p
    JOIN ai_analysis a ON a.post_id = p.id
    WHERE p.status = 'active'
  `;
  const params: unknown[] = [];

  if (flags.postIds?.length) {
    query += ` AND p.id IN (${flags.postIds.map(() => "?").join(",")})`;
    params.push(...flags.postIds);
  }

  query += " ORDER BY p.id DESC";
  if (flags.limit) {
    query += " LIMIT ?";
    params.push(flags.limit);
  }

  const posts = sqlite.prepare(query).all(...params) as PostRow[];
  const totalBatches = Math.ceil(posts.length / BATCH_SIZE);

  console.log(`[rescore] ${posts.length} posts in ${totalBatches} batches of ${BATCH_SIZE}, ${flags.concurrency} worker(s)`);
  console.log(`[rescore] Rate: ~${flags.concurrency} batch calls/sec (${flags.concurrency * BATCH_SIZE} posts/sec)`);
  if (flags.dryRun) console.log("[rescore] DRY RUN — no writes");

  const startTime = Date.now();
  let batchIdx = 0;
  let processed = 0;
  let errors = 0;
  const tierCounts: Record<string, number> = {};

  async function worker() {
    while (batchIdx * BATCH_SIZE < posts.length) {
      const currentBatch = batchIdx++;
      const start = currentBatch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, posts.length);
      const batchPosts = posts.slice(start, end);
      const batchLabel = `[batch ${currentBatch + 1}/${totalBatches}]`;

      try {
        // Build BatchPost array
        const batchInput: BatchPost[] = batchPosts.map(post => ({
          id: post.id,
          title: post.title,
          url: post.url,
          pageContent: post.page_content
            || post.story_text?.replace(/<[^>]*>/g, " ").slice(0, 3000)
            || post.title,
          storyText: post.story_text,
          readmeContent: post.readme_content || undefined,
          screenshotBase64: loadScreenshot(post.id),
        }));

        const screenshotCount = batchInput.filter(p => p.screenshotBase64).length;
        console.log(`  ${batchLabel} Sending ${batchInput.length} posts (${screenshotCount} with screenshots)...`);

        // One API call for the batch
        const { results, model, usage } = await analyzeBatch(batchInput);

        // Write results
        for (const post of batchPosts) {
          const result = results.get(post.id);
          if (!result) {
            errors++;
            console.error(`  ${batchLabel} ✗ ${post.id}: missing from batch response`);
            continue;
          }

          const pickScore = tierToPickScore(result.tier);
          tierCounts[result.tier] = (tierCounts[result.tier] || 0) + 1;

          const hasScreenshot = !!loadScreenshot(post.id);
          const vibeStr = result.vibe_tags.length > 0 ? ` [${result.vibe_tags.join(", ")}]` : "";

          if (!flags.dryRun) {
            updateStmt.run(
              result.summary,
              result.category,
              result.target_audience,
              result.tier,
              JSON.stringify(result.vibe_tags),
              result.highlight || post.pick_reason || "",
              pickScore,
              JSON.stringify(result.strengths),
              JSON.stringify(result.weaknesses),
              JSON.stringify(result.similar_to),
              Math.floor(Date.now() / 1000),
              model,
              post.id
            );
          }

          processed++;
          const postNum = start + batchPosts.indexOf(post) + 1;
          console.log(`  [${postNum}/${posts.length}] ${flags.dryRun ? "[dry]" : "✓"} ${post.id} | ${result.tier.toUpperCase().padEnd(6)}${hasScreenshot ? " 📸" : "   "}${vibeStr} | ${post.title.substring(0, 50)}`);
        }

        const cacheInfo = usage.cacheReadTokens > 0
          ? ` cache_hit=${usage.cacheReadTokens}`
          : "";
        console.log(`  ${batchLabel} Done: ${usage.inputTokens} in + ${usage.outputTokens} out tokens,${cacheInfo} ${usage.durationMs}ms`);
      } catch (err) {
        // Batch failed — count all posts in batch as errors
        errors += batchPosts.length;
        console.error(`  ${batchLabel} ✗ Batch failed: ${(err as Error).message}`);
      }

      // Rate limit per worker
      await new Promise((r) => setTimeout(r, WORKER_DELAY));
    }
  }

  const workers = Array.from(
    { length: Math.min(flags.concurrency, totalBatches) },
    () => worker()
  );
  await Promise.all(workers);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[rescore] Done in ${elapsed}s. ${processed} scored, ${errors} errors.`);

  console.log("\nTier distribution:");
  for (const tier of TIERS) {
    const count = tierCounts[tier] || 0;
    const pct = processed > 0 ? ((count / processed) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round(count / 5));
    console.log(`  ${tier.toUpperCase().padEnd(6)}: ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  }
}

main().catch((err) => {
  console.error("[rescore] Fatal:", err);
  process.exit(1);
});
