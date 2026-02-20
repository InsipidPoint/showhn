/**
 * Continuous task queue worker — processes screenshot and AI analysis tasks.
 * Run: npx tsx scripts/worker.ts
 *
 * Polls the task_queue table and processes pending tasks.
 * AI analysis is batched (up to BATCH_SIZE posts per API call).
 * Handles graceful shutdown on SIGTERM/SIGINT.
 * Designed to run as a long-lived PM2 process.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { chromium, type Browser } from "playwright";
import * as schema from "../src/lib/db/schema";
import { analyzeBatch, analyzePost, tierToPickScore, type BatchPost, type AnalysisResult } from "../src/lib/ai/llm";
import { fetchPageContent, parseGitHubRepo, fetchGitHubReadme, fetchGitHubMeta, loadScreenshot } from "../src/lib/fetchers";
import {
  dequeueBatch,
  completeTask,
  failTask,
  reclaimStaleTasks,
  getQueueStats,
} from "../src/lib/queue";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import dotenv from "dotenv";

// Load env
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

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

// Migration: ensure columns exist
for (const col of ["pick_reason TEXT", "pick_score INTEGER", "tier TEXT", "vibe_tags TEXT", "strengths TEXT", "weaknesses TEXT", "similar_to TEXT"]) {
  try { sqlite.exec(`ALTER TABLE ai_analysis ADD COLUMN ${col}`); } catch { /* exists */ }
}
for (const col of ["github_stars INTEGER", "github_language TEXT", "github_description TEXT", "github_updated_at INTEGER"]) {
  try { sqlite.exec(`ALTER TABLE posts ADD COLUMN ${col}`); } catch { /* exists */ }
}

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
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "5", 10);
const STALE_TIMEOUT = parseInt(
  process.env.WORKER_STALE_TIMEOUT || "300",
  10
);
const STATS_INTERVAL = 60_000; // Log stats every 60s

let running = true;
let browser: Browser | null = null;

// ─── Screenshot Helpers ──────────────────────────────────────────────────────

async function generateThumbnail(screenshotPath: string): Promise<void> {
  const thumbPath = screenshotPath.replace(/\.webp$/, "_thumb.webp");
  try {
    await sharp(screenshotPath)
      .resize(THUMB_WIDTH)
      .webp({ quality: 80 })
      .toFile(thumbPath);
  } catch (err) {
    console.error(`  [thumbnail] Failed for ${path.basename(screenshotPath)}:`, (err as Error).message);
  }
}

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

  const b = await ensureBrowser();
  const context = await b.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  try {
    const page = await context.newPage();
    await page.goto(url, {
      waitUntil: "load",
      timeout: SCREENSHOT_TIMEOUT,
    });
    try {
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch {
      // networkidle timed out — that's fine
    }
    await page.waitForTimeout(1500);

    const tmpPng = screenshotPath + ".tmp.png";
    await page.screenshot({
      path: tmpPng,
      type: "png",
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
    await sharp(tmpPng).webp({ quality: 85 }).toFile(screenshotPath);
    fs.unlinkSync(tmpPng);

    await generateThumbnail(screenshotPath);
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

// ─── Screenshot-only Task ────────────────────────────────────────────────────

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

// ─── Content Fetching (per-post, pre-AI) ─────────────────────────────────────

type FetchedPost = BatchPost & {
  /** Whether we successfully got/had a screenshot */
  hasScreenshot: boolean;
};

/**
 * Fetch content for a "process" task (URL post).
 * Handles GitHub fast path vs Playwright path.
 * Returns a BatchPost ready for analyzeBatch().
 */
async function fetchProcessContent(
  task: schema.TaskQueue,
  post: { id: number; title: string; url: string; storyText: string | null; status: string }
): Promise<FetchedPost> {
  const ghRepo = parseGitHubRepo(post.url);

  if (ghRepo) {
    // ── GitHub fast path — skip Playwright ──
    const [pageText, readmeContent, ghMeta] = await Promise.all([
      fetchPageContent(post.url),
      fetchGitHubReadme(ghRepo.owner, ghRepo.repo),
      fetchGitHubMeta(ghRepo.owner, ghRepo.repo),
    ]);

    const now = Math.floor(Date.now() / 1000);
    db.update(schema.posts)
      .set({
        pageContent: pageText || null,
        readmeContent: readmeContent || null,
        ...(ghMeta ? {
          githubStars: ghMeta.stars,
          githubLanguage: ghMeta.language,
          githubDescription: ghMeta.description,
          githubUpdatedAt: now,
        } : {}),
      })
      .where(eq(schema.posts.id, post.id))
      .run();

    if (ghMeta) {
      console.log(`  [fetch] (GitHub) ${ghRepo.owner}/${ghRepo.repo}: ${ghMeta.stars} stars`);
    }

    return {
      id: post.id,
      title: post.title,
      url: post.url,
      pageContent: pageText || readmeContent || post.title,
      storyText: post.storyText,
      readmeContent: readmeContent || undefined,
      screenshotBase64: undefined, // no screenshot for GitHub repos
      hasScreenshot: false,
    };
  }

  // ── Playwright path — screenshot + rendered text ──
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let pageText = "";
  let screenshotSuccess = false;
  const screenshotPath = path.join(SCREENSHOT_DIR, `${post.id}.webp`);
  const hasExistingScreenshot = post.status === "active" && fs.existsSync(screenshotPath);

  const b = await ensureBrowser();
  const context = await b.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  try {
    const page = await context.newPage();
    await page.goto(post.url, { waitUntil: "load", timeout: SCREENSHOT_TIMEOUT });
    try {
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch { /* ok */ }
    await page.waitForTimeout(1500);

    if (!hasExistingScreenshot) {
      try {
        const tmpPng = screenshotPath + ".tmp.png";
        await page.screenshot({
          path: tmpPng,
          type: "png",
          clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
        });
        await sharp(tmpPng).webp({ quality: 85 }).toFile(screenshotPath);
        fs.unlinkSync(tmpPng);
        await generateThumbnail(screenshotPath);
        screenshotSuccess = true;
      } catch (err) {
        console.error(`  [fetch] Screenshot failed for post ${post.id}:`, (err as Error).message);
      }
    } else {
      screenshotSuccess = true;
    }

    try {
      pageText = await page.innerText("body");
      pageText = pageText.replace(/\s+/g, " ").trim().slice(0, 5000);
    } catch {
      pageText = "";
    }
  } catch (err) {
    console.error(`  [fetch] Page load failed for post ${post.id} (${post.url}):`, (err as Error).message);
    if (hasExistingScreenshot) {
      screenshotSuccess = true;
      pageText = await fetchPageContent(post.url);
    }
  } finally {
    await context.close();
  }

  // Update screenshot status + store page content
  if (screenshotSuccess) {
    db.update(schema.posts)
      .set({ hasScreenshot: 1, pageContent: pageText || null })
      .where(eq(schema.posts.id, post.id))
      .run();
  } else if (pageText) {
    db.update(schema.posts)
      .set({ pageContent: pageText })
      .where(eq(schema.posts.id, post.id))
      .run();
  }

  // Fetch GitHub README if applicable (non-GitHub URL but might link to GitHub)
  let readmeContent: string | undefined;
  const ghRepoInfo = parseGitHubRepo(post.url);
  if (ghRepoInfo) {
    const readme = await fetchGitHubReadme(ghRepoInfo.owner, ghRepoInfo.repo);
    if (readme) {
      readmeContent = readme;
      db.update(schema.posts)
        .set({ readmeContent })
        .where(eq(schema.posts.id, post.id))
        .run();
    }
  }

  if (!pageText && !post.storyText && !readmeContent) {
    pageText = post.title;
  }

  const screenshotBase64 = screenshotSuccess ? loadScreenshot(post.id) : undefined;

  return {
    id: post.id,
    title: post.title,
    url: post.url,
    pageContent: pageText,
    storyText: post.storyText,
    readmeContent,
    screenshotBase64,
    hasScreenshot: screenshotSuccess,
  };
}

/**
 * Fetch content for an "analyze" task (text-only or re-analysis).
 */
async function fetchAnalyzeContent(
  post: { id: number; title: string; url: string | null; storyText: string | null }
): Promise<FetchedPost> {
  let pageContent = "";
  if (post.url) {
    pageContent = await fetchPageContent(post.url);
  }
  if (!pageContent && !post.storyText) {
    pageContent = post.title;
  }

  let readmeContent: string | undefined;
  if (post.url) {
    const ghRepo = parseGitHubRepo(post.url);
    if (ghRepo) {
      readmeContent = await fetchGitHubReadme(ghRepo.owner, ghRepo.repo) || undefined;
    }
  }

  const screenshotBase64 = loadScreenshot(post.id);

  return {
    id: post.id,
    title: post.title,
    url: post.url,
    pageContent,
    storyText: post.storyText,
    readmeContent,
    screenshotBase64,
    hasScreenshot: !!screenshotBase64,
  };
}

// ─── DB Upsert Helper ────────────────────────────────────────────────────────

function upsertAnalysis(postId: number, result: AnalysisResult, model: string): void {
  const pickScore = tierToPickScore(result.tier);
  const now = Math.floor(Date.now() / 1000);

  db.insert(schema.aiAnalysis)
    .values({
      postId,
      summary: result.summary,
      category: result.category,
      targetAudience: result.target_audience,
      pickReason: result.highlight,
      pickScore,
      tier: result.tier,
      vibeTags: JSON.stringify(result.vibe_tags),
      strengths: JSON.stringify(result.strengths),
      weaknesses: JSON.stringify(result.weaknesses),
      similarTo: JSON.stringify(result.similar_to),
      analyzedAt: now,
      model,
    })
    .onConflictDoUpdate({
      target: schema.aiAnalysis.postId,
      set: {
        summary: result.summary,
        category: result.category,
        targetAudience: result.target_audience,
        pickReason: result.highlight,
        pickScore,
        tier: result.tier,
        vibeTags: JSON.stringify(result.vibe_tags),
        strengths: JSON.stringify(result.strengths),
        weaknesses: JSON.stringify(result.weaknesses),
        similarTo: JSON.stringify(result.similar_to),
        analyzedAt: now,
        model,
      },
    })
    .run();
}

// ─── Main Worker Loop ────────────────────────────────────────────────────────

async function workerLoop(): Promise<void> {
  console.log("[worker] Starting task queue worker (batch mode)...");
  console.log(`[worker] Poll interval: ${POLL_INTERVAL}ms, Batch size: ${BATCH_SIZE}, Stale timeout: ${STALE_TIMEOUT}s`);

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

    // Dequeue a batch of tasks
    const tasks = dequeueBatch(db, BATCH_SIZE);

    if (tasks.length === 0) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    console.log(`[worker] Dequeued ${tasks.length} task(s): ${tasks.map(t => `#${t.id}(${t.type}:${t.postId})`).join(", ")}`);

    // Separate screenshot-only tasks from AI tasks
    const screenshotTasks = tasks.filter(t => t.type === "screenshot");
    const aiTasks = tasks.filter(t => t.type === "process" || t.type === "analyze");
    const unknownTasks = tasks.filter(t => t.type !== "screenshot" && t.type !== "process" && t.type !== "analyze");

    // Handle unknown task types
    for (const task of unknownTasks) {
      console.warn(`[worker] Unknown task type: ${task.type}`);
      failTask(db, task.id, `Unknown task type: ${task.type}`);
    }

    // Process screenshot-only tasks individually (no AI)
    for (const task of screenshotTasks) {
      console.log(`[worker] Processing screenshot task #${task.id} for post ${task.postId}`);
      await processScreenshot(task);
    }

    // Process AI tasks as a batch
    if (aiTasks.length > 0) {
      await processBatch(aiTasks);
    }
  }
}

/**
 * Process a batch of AI tasks (process/analyze).
 * Phase 1: Content fetch per-post (sequential for Playwright, parallel for GitHub).
 * Phase 2: Single batch AI call.
 * Phase 3: Write results to DB.
 * Falls back to individual calls if batch fails.
 */
async function processBatch(tasks: schema.TaskQueue[]): Promise<void> {
  const batchStart = Date.now();

  // Phase 1: Fetch content for each post
  const fetchStart = Date.now();
  const batchPosts: FetchedPost[] = [];
  const taskMap = new Map<number, schema.TaskQueue>(); // postId → task

  for (const task of tasks) {
    try {
      if (task.type === "process") {
        const post = db
          .select({
            id: schema.posts.id,
            title: schema.posts.title,
            url: schema.posts.url,
            storyText: schema.posts.storyText,
            status: schema.posts.status,
          })
          .from(schema.posts)
          .where(eq(schema.posts.id, task.postId))
          .get();

        if (!post || !post.url || post.status !== "active") {
          completeTask(db, task.id);
          console.log(`  [batch] Skipped post ${task.postId} (no url or inactive)`);
          continue;
        }

        const t0 = Date.now();
        const fetched = await fetchProcessContent(task, post as { id: number; title: string; url: string; storyText: string | null; status: string });
        const fetchMs = Date.now() - t0;
        batchPosts.push(fetched);
        taskMap.set(fetched.id, task);

        const contentLen = fetched.pageContent.length;
        const readmeLen = fetched.readmeContent?.length ?? 0;
        console.log(`  [batch] Fetched post ${post.id}: ${contentLen} page chars, ${readmeLen} readme chars, screenshot=${fetched.hasScreenshot} (${fetchMs}ms)`);
      } else if (task.type === "analyze") {
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
          console.log(`  [batch] Skipped post ${task.postId} (not found)`);
          continue;
        }

        const t0 = Date.now();
        const fetched = await fetchAnalyzeContent(post);
        const fetchMs = Date.now() - t0;
        batchPosts.push(fetched);
        taskMap.set(fetched.id, task);

        const contentLen = fetched.pageContent.length;
        const readmeLen = fetched.readmeContent?.length ?? 0;
        console.log(`  [batch] Fetched post ${post.id} (analyze): ${contentLen} page chars, ${readmeLen} readme chars, screenshot=${fetched.hasScreenshot} (${fetchMs}ms)`);
      }
    } catch (err) {
      failTask(db, task.id, (err as Error).message);
      console.error(`  [batch] Content fetch failed for post ${task.postId}: ${(err as Error).message}`);
    }
  }

  if (batchPosts.length === 0) return;

  const fetchElapsed = Date.now() - fetchStart;
  console.log(`  [batch] Content fetch phase: ${batchPosts.length} post(s) in ${fetchElapsed}ms`);

  // Phase 2: Batch AI analysis
  console.log(`  [batch] Sending ${batchPosts.length} post(s) to AI...`);

  try {
    const { results, model, usage } = await analyzeBatch(batchPosts);

    // Phase 3: Write results
    for (const [postId, result] of results) {
      const task = taskMap.get(postId)!;
      upsertAnalysis(postId, result, model);
      completeTask(db, task.id);

      const post = batchPosts.find(p => p.id === postId)!;
      console.log(`  [batch] ✓ Post ${postId}: [${result.tier}] ${post.title.slice(0, 50)}`);
    }

    const totalMs = Date.now() - batchStart;
    console.log(`  [batch] Complete: ${batchPosts.length} posts, ${usage.durationMs}ms API, ${totalMs}ms total`);
  } catch (err) {
    console.error(`  [batch] Batch AI call failed: ${(err as Error).message}`);
    console.log(`  [batch] Falling back to individual analysis...`);

    // Fallback: process each post individually
    for (const post of batchPosts) {
      const task = taskMap.get(post.id)!;
      try {
        const { result, model } = await analyzePost(
          post.title,
          post.url,
          post.pageContent,
          post.storyText,
          post.readmeContent,
          post.screenshotBase64
        );
        upsertAnalysis(post.id, result, model);
        completeTask(db, task.id);
        console.log(`  [batch] ✓ Post ${post.id} (fallback): [${result.tier}] ${post.title.slice(0, 50)}`);
      } catch (innerErr) {
        failTask(db, task.id, (innerErr as Error).message);
        console.error(`  [batch] ✗ Post ${post.id} (fallback): ${(innerErr as Error).message}`);
      }
    }

    const totalMs = Date.now() - batchStart;
    console.log(`  [batch] Complete (with fallbacks): ${batchPosts.length} posts, ${totalMs}ms total`);
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
