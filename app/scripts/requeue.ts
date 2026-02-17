/**
 * Re-enqueue tasks for reprocessing.
 * Useful when you update the AI model/prompt or need to retake screenshots.
 *
 * Usage:
 *   npx tsx scripts/requeue.ts analyze                    # all posts without analysis
 *   npx tsx scripts/requeue.ts analyze --all              # all posts (re-analyze everything)
 *   npx tsx scripts/requeue.ts analyze --model gpt-4o-mini  # posts analyzed with a specific model
 *   npx tsx scripts/requeue.ts analyze --before 2025-01-01  # posts analyzed before a date
 *   npx tsx scripts/requeue.ts analyze --post 12345 67890   # specific post IDs
 *   npx tsx scripts/requeue.ts screenshot --all           # retake all screenshots
 *   npx tsx scripts/requeue.ts screenshot --failed        # retry failed screenshot tasks
 *   npx tsx scripts/requeue.ts --stats                    # show queue stats
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, isNull, sql, lte } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { bulkEnqueue, getQueueStats, type TaskType } from "../src/lib/queue";
import path from "path";

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: Record<string, string | boolean | string[]> = {};
  let taskType: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--all") {
      flags.all = true;
    } else if (arg === "--failed") {
      flags.failed = true;
    } else if (arg === "--stats") {
      flags.stats = true;
    } else if (arg === "--model" && args[i + 1]) {
      flags.model = args[++i];
    } else if (arg === "--before" && args[i + 1]) {
      flags.before = args[++i];
    } else if (arg === "--priority" && args[i + 1]) {
      flags.priority = args[++i];
    } else if (arg === "--post") {
      // Collect all following numeric args as post IDs
      const postIds: string[] = [];
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        postIds.push(args[++i]);
      }
      flags.post = postIds;
    } else if (!arg.startsWith("--")) {
      taskType = arg;
    }
    i++;
  }

  return { taskType, flags };
}

function showStats() {
  const stats = getQueueStats(db);
  console.log("[requeue] Queue stats:");
  if (Object.keys(stats).length === 0) {
    console.log("  (empty)");
    return;
  }
  for (const [key, count] of Object.entries(stats)) {
    console.log(`  ${key}: ${count}`);
  }
}

function getPostIdsForAnalyze(flags: Record<string, string | boolean | string[]>): number[] {
  if (flags.post) {
    return (flags.post as string[]).map(Number).filter((n) => !isNaN(n));
  }

  if (flags.all) {
    // All posts (re-analyze everything)
    return db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .all()
      .map((r) => r.id);
  }

  if (flags.model) {
    // Posts analyzed with a specific model
    return db
      .select({ id: schema.aiAnalysis.postId })
      .from(schema.aiAnalysis)
      .where(eq(schema.aiAnalysis.model, flags.model as string))
      .all()
      .map((r) => r.id);
  }

  if (flags.before) {
    // Posts analyzed before a date
    const cutoff = Math.floor(new Date(flags.before as string).getTime() / 1000);
    if (isNaN(cutoff)) {
      console.error(`[requeue] Invalid date: ${flags.before}`);
      process.exit(1);
    }
    return db
      .select({ id: schema.aiAnalysis.postId })
      .from(schema.aiAnalysis)
      .where(lte(schema.aiAnalysis.analyzedAt, cutoff))
      .all()
      .map((r) => r.id);
  }

  if (flags.failed) {
    // Re-enqueue failed analyze tasks
    return db
      .select({ postId: schema.taskQueue.postId })
      .from(schema.taskQueue)
      .where(
        and(
          eq(schema.taskQueue.type, "analyze"),
          eq(schema.taskQueue.status, "failed")
        )
      )
      .all()
      .map((r) => r.postId);
  }

  // Default: posts without any analysis
  return db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .leftJoin(schema.aiAnalysis, eq(schema.posts.id, schema.aiAnalysis.postId))
    .where(isNull(schema.aiAnalysis.postId))
    .all()
    .map((r) => r.id);
}

function getPostIdsForScreenshot(flags: Record<string, string | boolean | string[]>): number[] {
  if (flags.post) {
    return (flags.post as string[]).map(Number).filter((n) => !isNaN(n));
  }

  if (flags.all) {
    // All posts with URLs
    return db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.status, "active"),
          sql`${schema.posts.url} IS NOT NULL`
        )
      )
      .all()
      .map((r) => r.id);
  }

  if (flags.failed) {
    // Re-enqueue failed screenshot tasks
    return db
      .select({ postId: schema.taskQueue.postId })
      .from(schema.taskQueue)
      .where(
        and(
          eq(schema.taskQueue.type, "screenshot"),
          eq(schema.taskQueue.status, "failed")
        )
      )
      .all()
      .map((r) => r.postId);
  }

  // Default: posts without screenshots
  return db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.hasScreenshot, 0),
        eq(schema.posts.status, "active"),
        sql`${schema.posts.url} IS NOT NULL`
      )
    )
    .all()
    .map((r) => r.id);
}

function main() {
  const { taskType, flags } = parseArgs();

  if (flags.stats) {
    showStats();
    return;
  }

  if (!taskType || !["screenshot", "analyze"].includes(taskType)) {
    console.error("Usage: npx tsx scripts/requeue.ts <screenshot|analyze> [options]");
    console.error("       npx tsx scripts/requeue.ts --stats");
    console.error("");
    console.error("Options:");
    console.error("  --all              Reprocess all posts");
    console.error("  --failed           Retry failed tasks");
    console.error("  --model <name>     Posts analyzed with specific model (analyze only)");
    console.error("  --before <date>    Posts analyzed before date (analyze only)");
    console.error("  --post <id> ...    Specific post IDs");
    console.error("  --priority <n>     Task priority (default 0, higher = processed sooner)");
    console.error("  --stats            Show queue statistics");
    process.exit(1);
  }

  const type = taskType as TaskType;
  const priority = flags.priority ? parseInt(flags.priority as string, 10) : 0;

  const postIds =
    type === "analyze"
      ? getPostIdsForAnalyze(flags)
      : getPostIdsForScreenshot(flags);

  if (postIds.length === 0) {
    console.log(`[requeue] No posts to enqueue for ${type}`);
    return;
  }

  console.log(`[requeue] Enqueuing ${postIds.length} ${type} tasks (priority=${priority})...`);
  const enqueued = bulkEnqueue(db, type, postIds, priority);
  console.log(`[requeue] Done. ${enqueued} tasks enqueued (${postIds.length - enqueued} already pending).`);
}

main();
