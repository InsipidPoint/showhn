/**
 * AI analysis pipeline — analyzes Show HN posts using configurable LLM.
 * Run: npx tsx scripts/analyze.ts
 * Pass --limit N to cap the number of posts analyzed per run.
 *
 * Requires env vars:
 *   ANALYSIS_PROVIDER=openai (or "anthropic")
 *   ANALYSIS_MODEL=gpt-4o-mini (or claude model ID)
 *   OPENAI_API_KEY=sk-...  (if using openai)
 *   ANTHROPIC_API_KEY=sk-ant-...  (if using anthropic)
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, isNull, sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { analyzePost } from "../src/lib/ai/llm";
import path from "path";
import dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });

function getLimit(): number {
  const idx = process.argv.indexOf("--limit");
  if (idx !== -1 && process.argv[idx + 1]) {
    return parseInt(process.argv[idx + 1], 10);
  }
  return 0;
}

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

    // Basic HTML to text extraction
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

async function analyzeOne(post: {
  id: number;
  title: string;
  url: string | null;
  storyText: string | null;
}): Promise<boolean> {
  try {
    // Fetch page content if URL exists
    let pageContent = "";
    if (post.url) {
      pageContent = await fetchPageContent(post.url);
    }

    // If no page content and no story text, use just the title
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
        commentSentiment: null, // TODO: add comment sentiment later
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

    return true;
  } catch (err) {
    console.error(`  [analyze] Error for post ${post.id}:`, (err as Error).message);
    return false;
  }
}

async function run() {
  const provider = process.env.ANALYSIS_PROVIDER || "openai";
  const model = process.env.ANALYSIS_MODEL || "gpt-4o-mini";
  console.log(`[analyze] Provider: ${provider}, Model: ${model}`);

  // Validate API key
  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    console.error("[analyze] OPENAI_API_KEY not set in .env.local");
    process.exit(1);
  }
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    console.error("[analyze] ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }

  const limit = getLimit();

  // Get posts without AI analysis, newest first
  const pending = db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      url: schema.posts.url,
      storyText: schema.posts.storyText,
    })
    .from(schema.posts)
    .leftJoin(schema.aiAnalysis, eq(schema.posts.id, schema.aiAnalysis.postId))
    .where(isNull(schema.aiAnalysis.postId))
    .orderBy(sql`${schema.posts.createdAt} DESC`)
    .limit(limit > 0 ? limit : 1000)
    .all();

  console.log(`[analyze] ${pending.length} posts need analysis`);
  if (pending.length === 0) return;

  let success = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const post = pending[i];
    process.stdout.write(
      `  [analyze] ${i + 1}/${pending.length} Post ${post.id}: ${post.title.slice(0, 50)}... `
    );

    const ok = await analyzeOne(post);
    if (ok) {
      success++;
      console.log("OK");
    } else {
      failed++;
      console.log("FAILED");
    }

    // Rate limit: ~2 req/sec to be safe
    if (i < pending.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`[analyze] Done. ${success} analyzed, ${failed} failed.`);
}

run().catch((err) => {
  console.error("[analyze] Fatal error:", err);
  process.exit(1);
});
