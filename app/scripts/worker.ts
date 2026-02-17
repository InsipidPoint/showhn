/**
 * Continuous task queue worker — processes screenshot and AI analysis tasks.
 * Run: npx tsx scripts/worker.ts
 *
 * Polls the task_queue table and processes pending tasks.
 * Handles graceful shutdown on SIGTERM/SIGINT.
 * Designed to run as a long-lived PM2 process.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, isNotNull } from "drizzle-orm";
import { chromium, type Browser } from "playwright";
import * as schema from "../src/lib/db/schema";
import { analyzePost } from "../src/lib/ai/llm";
import {
  dequeueTask,
  completeTask,
  failTask,
  reclaimStaleTasks,
  getQueueStats,
} from "../src/lib/queue";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Load env
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

// Ensure task_queue table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS task_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_queue_status_priority ON task_queue(status, priority);
  CREATE INDEX IF NOT EXISTS idx_queue_type ON task_queue(type);
  CREATE INDEX IF NOT EXISTS idx_queue_post_id ON task_queue(post_id);
`);

// Screenshot config
const SCREENSHOT_DIR = path.join(process.cwd(), "public", "screenshots");
const SCREENSHOT_TIMEOUT = parseInt(
  process.env.SCREENSHOT_TIMEOUT || "15000",
  10
);
const VIEWPORT = { width: 1280, height: 800 };
const THUMB_WIDTH = 640;

// Worker config
const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL || "2000", 10);
const STALE_TIMEOUT = parseInt(
  process.env.WORKER_STALE_TIMEOUT || "300",
  10
);
const STATS_INTERVAL = 60_000; // Log stats every 60s

let running = true;
let browser: Browser | null = null;

// ─── Screenshot Processing ──────────────────────────────────────────────────

async function ensureBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    console.log("[worker] Browser launched");
  }
  return browser;
}

async function takeScreenshot(
  postId: number,
  url: string
): Promise<boolean> {
  const screenshotPath = path.join(SCREENSHOT_DIR, `${postId}.webp`);
  const thumbPath = path.join(SCREENSHOT_DIR, `${postId}_thumb.webp`);

  const b = await ensureBrowser();
  const context = await b.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  try {
    const page = await context.newPage();
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: SCREENSHOT_TIMEOUT,
    });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: screenshotPath,
      type: "png",
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });

    await page.setViewportSize({ width: THUMB_WIDTH, height: 400 });
    await page.screenshot({
      path: thumbPath,
      type: "png",
      clip: { x: 0, y: 0, width: THUMB_WIDTH, height: 400 },
    });

    return true;
  } catch (err) {
    console.error(
      `  [screenshot] Failed for post ${postId} (${url}):`,
      (err as Error).message
    );
    return false;
  } finally {
    await context.close();
  }
}

async function processScreenshot(task: schema.TaskQueue): Promise<void> {
  const post = db
    .select({ id: schema.posts.id, url: schema.posts.url, status: schema.posts.status })
    .from(schema.posts)
    .where(eq(schema.posts.id, task.postId))
    .get();

  if (!post || !post.url || post.status !== "active") {
    completeTask(db, task.id);
    console.log(`  [screenshot] Skipped post ${task.postId} (no url or inactive)`);
    return;
  }

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let success = await takeScreenshot(post.id, post.url);

  // One retry with delay
  if (!success) {
    console.log(`  [screenshot] Retrying post ${post.id}...`);
    await new Promise((r) => setTimeout(r, 2000));
    success = await takeScreenshot(post.id, post.url);
  }

  if (success) {
    db.update(schema.posts)
      .set({ hasScreenshot: 1 })
      .where(eq(schema.posts.id, post.id))
      .run();
    completeTask(db, task.id);
    console.log(`  [screenshot] ✓ Post ${post.id}`);
  } else {
    // Mark post as dead after exhausting task retries
    if ((task.attempts ?? 0) >= (task.maxAttempts ?? 3)) {
      db.update(schema.posts)
        .set({ status: "dead" })
        .where(eq(schema.posts.id, post.id))
        .run();
    }
    failTask(db, task.id, "Screenshot capture failed");
    console.log(`  [screenshot] ✗ Post ${post.id}`);
  }
}

// ─── AI Analysis Processing ─────────────────────────────────────────────────

async function fetchPageContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HNShowcase/1.0; +https://hnshowcase.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return "";
    const html = await res.text();

    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
  } catch {
    return "";
  }
}

async function processAnalysis(task: schema.TaskQueue): Promise<void> {
  const post = db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      url: schema.posts.url,
      storyText: schema.posts.storyText,
    })
    .from(schema.posts)
    .where(eq(schema.posts.id, task.postId))
    .get();

  if (!post) {
    completeTask(db, task.id);
    console.log(`  [analyze] Skipped post ${task.postId} (not found)`);
    return;
  }

  try {
    let pageContent = "";
    if (post.url) {
      pageContent = await fetchPageContent(post.url);
    }

    if (!pageContent && !post.storyText) {
      pageContent = post.title;
    }

    const { result, model } = await analyzePost(
      post.title,
      post.url,
      pageContent,
      post.storyText
    );

    const now = Math.floor(Date.now() / 1000);

    db.insert(schema.aiAnalysis)
      .values({
        postId: post.id,
        summary: result.summary,
        category: result.category,
        techStack: JSON.stringify(result.tech_stack),
        targetAudience: result.target_audience,
        vibeScore: result.vibe_score,
        interestScore: result.interest_score,
        commentSentiment: null,
        tags: JSON.stringify(result.tags),
        analyzedAt: now,
        model,
      })
      .onConflictDoUpdate({
        target: schema.aiAnalysis.postId,
        set: {
          summary: result.summary,
          category: result.category,
          techStack: JSON.stringify(result.tech_stack),
          targetAudience: result.target_audience,
          vibeScore: result.vibe_score,
          interestScore: result.interest_score,
          tags: JSON.stringify(result.tags),
          analyzedAt: now,
          model,
        },
      })
      .run();

    completeTask(db, task.id);
    console.log(`  [analyze] ✓ Post ${post.id}: ${post.title.slice(0, 50)}`);
  } catch (err) {
    failTask(db, task.id, (err as Error).message);
    console.error(`  [analyze] ✗ Post ${post.id}: ${(err as Error).message}`);
  }
}

// ─── Main Worker Loop ────────────────────────────────────────────────────────

async function processTask(task: schema.TaskQueue): Promise<void> {
  switch (task.type) {
    case "screenshot":
      await processScreenshot(task);
      break;
    case "analyze":
      await processAnalysis(task);
      break;
    default:
      console.warn(`[worker] Unknown task type: ${task.type}`);
      failTask(db, task.id, `Unknown task type: ${task.type}`);
  }
}

async function workerLoop(): Promise<void> {
  console.log("[worker] Starting task queue worker...");
  console.log(`[worker] Poll interval: ${POLL_INTERVAL}ms, Stale timeout: ${STALE_TIMEOUT}s`);

  // Reclaim any stale tasks from a previous crash
  const reclaimed = reclaimStaleTasks(db, STALE_TIMEOUT);
  if (reclaimed > 0) {
    console.log(`[worker] Reclaimed ${reclaimed} stale tasks`);
  }

  let lastStatsLog = Date.now();

  while (running) {
    // Periodically log stats and reclaim stale tasks
    if (Date.now() - lastStatsLog > STATS_INTERVAL) {
      const stale = reclaimStaleTasks(db, STALE_TIMEOUT);
      if (stale > 0) console.log(`[worker] Reclaimed ${stale} stale tasks`);

      const stats = getQueueStats(db);
      const parts = Object.entries(stats).map(([k, v]) => `${k}=${v}`);
      if (parts.length > 0) {
        console.log(`[worker] Queue stats: ${parts.join(", ")}`);
      }
      lastStatsLog = Date.now();
    }

    // Try to dequeue a task
    const task = dequeueTask(db);

    if (!task) {
      // No tasks — sleep and poll again
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    console.log(
      `[worker] Processing task #${task.id}: ${task.type} for post ${task.postId} (attempt ${task.attempts})`
    );

    await processTask(task);

    // Small delay between tasks to avoid hammering resources
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[worker] Received ${signal}, shutting down gracefully...`);
  running = false;

  if (browser) {
    try {
      await browser.close();
      console.log("[worker] Browser closed");
    } catch {
      // ignore
    }
  }

  sqlite.close();
  console.log("[worker] Database closed. Goodbye.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Start ───────────────────────────────────────────────────────────────────

workerLoop().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
