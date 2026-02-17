/**
 * Re-score existing posts using data already in the DB.
 * No browser launch, no page fetching — uses existing AI analysis
 * (summary, category, tech_stack, tags, pick_reason) plus post metadata
 * to ask the LLM to re-evaluate with the new scoring dimensions.
 *
 * Usage:
 *   npx tsx scripts/rescore.ts                  # all posts with existing analysis
 *   npx tsx scripts/rescore.ts --limit 50       # first 50 posts
 *   npx tsx scripts/rescore.ts --post 123 456   # specific post IDs
 *   npx tsx scripts/rescore.ts --dry-run        # preview without writing
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import * as schema from "../src/lib/db/schema";
import { computePickScore } from "../src/lib/ai/llm";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });

const RATE_DELAY = parseInt(process.env.RESCORE_DELAY || "300", 10);

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: { limit?: number; postIds?: number[]; dryRun: boolean } = { dryRun: false };
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--limit" && args[i + 1]) {
      flags.limit = parseInt(args[++i], 10);
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

function buildRescorePrompt(post: {
  title: string;
  url: string | null;
  points: number;
  comments: number;
  storyText: string | null;
  summary: string | null;
  category: string | null;
  techStack: string | null;
  targetAudience: string | null;
  tags: string | null;
  pickReason: string | null;
}): string {
  const techStack = post.techStack ? JSON.parse(post.techStack) : [];
  const tags = post.tags ? JSON.parse(post.tags) : [];

  return `Re-evaluate this Show HN project on three dimensions. You have the project's metadata and a previous AI summary — use all of it to score.

Title: ${post.title}
URL: ${post.url || "N/A (text-only post)"}
HN engagement: ${post.points} points, ${post.comments} comments
${post.storyText ? `Author's description: ${post.storyText.replace(/<[^>]*>/g, " ").slice(0, 500)}` : ""}
${post.summary ? `Previous summary: ${post.summary}` : ""}
${post.category ? `Category: ${post.category}` : ""}
${techStack.length ? `Tech stack: ${techStack.join(", ")}` : ""}
${post.targetAudience ? `Target audience: ${post.targetAudience}` : ""}
${tags.length ? `Tags: ${tags.join(", ")}` : ""}
${post.pickReason ? `Previous pick reason: ${post.pickReason}` : ""}

Return ONLY a JSON object with these fields:
{
  "novelty_score": 1-10,
  "craft_score": 1-10,
  "appeal_score": 1-10,
  "pick_reason": "One sentence on what makes this noteworthy, or 'Nothing stands out'"
}

SCORING GUIDE — use the FULL 1-10 range. Bell curve around 5.

NOVELTY — "Have I seen this before?"
  High (7-9): Chess engine in 2KB. Visualizing transformer internals in-browser. Real-time bot attack map. Genuinely new approach.
  Medium (4-6): Interesting twist on existing concept. Fresh combination of known ideas.
  Low (1-3): Another todo app. "X but in Rust/Go." Generic AI wrapper, CRM, dashboard. Clone with no differentiator.

CRAFT — "How impressive is the execution?"
  Rewards BOTH elegant small projects AND ambitious large systems. Quality over scope.
  High (7-9): Extreme constraint mastery (2KB chess). Deep systems work (Snowflake emulator in Rust). Polished UI/UX. Production-grade infra.
  Medium (4-6): Competent engineering, works as described. Standard web stack used well.
  Low (1-3): Minimal API wrapper. Tutorial-level. Broken demo. README-only, no working product.

APPEAL — "Would someone be excited to discover this?"
  Captures BOTH practical value AND delight/fun/coolness.
  High (7-9): Playable Moog synth in browser. SQL traffic viewer devs immediately want. LLM search over topical documents. Self-hosted Firebase alternative filling real gap.
  Medium (4-6): Useful for niche audience. Decent tool with existing alternatives.
  Low (1-3): Generic SaaS, no demo. Dry enterprise pitch with buzzword README. Narrow library with no "aha moment."

IMPORTANT: Don't penalize good enterprise/infra projects — a well-executed DB tool that solves real pain scores high on Appeal ("I need this!") even if it's not "fun."

Return ONLY valid JSON, no markdown fencing.`;
}

async function rescorePost(prompt: string): Promise<{
  novelty_score: number;
  craft_score: number;
  appeal_score: number;
  pick_reason: string;
} | null> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await client.chat.completions.create({
      model: process.env.ANALYSIS_MODEL || "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 800,
      response_format: { type: "json_object" },
    });
    const raw = response.choices[0]?.message?.content || "";
    if (!raw) {
      console.error("  Empty response from API. Finish reason:", response.choices[0]?.finish_reason);
      return null;
    }
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("  API error:", (err as Error).message);
    return null;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

async function main() {
  const flags = parseArgs();

  // Get posts with existing analysis
  let query = `
    SELECT p.id, p.title, p.url, p.points, p.comments, p.story_text,
           a.summary, a.category, a.tech_stack, a.target_audience, a.tags, a.pick_reason
    FROM posts p
    JOIN ai_analysis a ON a.post_id = p.id
  `;
  const params: unknown[] = [];

  if (flags.postIds?.length) {
    query += ` WHERE p.id IN (${flags.postIds.map(() => "?").join(",")})`;
    params.push(...flags.postIds);
  }

  query += " ORDER BY p.id ASC";
  if (flags.limit) {
    query += " LIMIT ?";
    params.push(flags.limit);
  }

  const posts = sqlite.prepare(query).all(...params) as Array<{
    id: number;
    title: string;
    url: string | null;
    points: number;
    comments: number;
    story_text: string | null;
    summary: string | null;
    category: string | null;
    tech_stack: string | null;
    target_audience: string | null;
    tags: string | null;
    pick_reason: string | null;
  }>;

  console.log(`[rescore] Found ${posts.length} posts to re-score`);
  if (flags.dryRun) console.log("[rescore] DRY RUN — no writes");

  let processed = 0;
  let errors = 0;

  for (const post of posts) {
    const prompt = buildRescorePrompt({
      title: post.title,
      url: post.url,
      points: post.points,
      comments: post.comments,
      storyText: post.story_text,
      summary: post.summary,
      category: post.category,
      techStack: post.tech_stack,
      targetAudience: post.target_audience,
      tags: post.tags,
      pickReason: post.pick_reason,
    });

    const result = await rescorePost(prompt);
    if (!result) {
      errors++;
      console.log(`  ✗ Post ${post.id}: API error`);
      continue;
    }

    const novelty = clamp(result.novelty_score || 3, 1, 10);
    const craft = clamp(result.craft_score || 3, 1, 10);
    const appeal = clamp(result.appeal_score || 3, 1, 10);
    const pickScore = computePickScore(novelty, appeal, craft);
    const pickReason = String(result.pick_reason || post.pick_reason || "");

    if (flags.dryRun) {
      console.log(`  [dry] ${post.id} | N:${novelty} C:${craft} A:${appeal} → ${pickScore} | ${post.title.substring(0, 55)}`);
    } else {
      db.update(schema.aiAnalysis)
        .set({
          noveltyScore: novelty,
          ambitionScore: craft,
          usefulnessScore: appeal,
          pickScore,
          pickReason,
          analyzedAt: Math.floor(Date.now() / 1000),
          model: process.env.ANALYSIS_MODEL || "gpt-5-mini",
        })
        .where(eq(schema.aiAnalysis.postId, post.id))
        .run();
      console.log(`  ✓ ${post.id} | N:${novelty} C:${craft} A:${appeal} → ${pickScore} | ${post.title.substring(0, 55)}`);
    }

    processed++;

    // Rate limit
    if (processed < posts.length) {
      await new Promise((r) => setTimeout(r, RATE_DELAY));
    }
  }

  console.log(`\n[rescore] Done. ${processed} processed, ${errors} errors.`);
}

main().catch((err) => {
  console.error("[rescore] Fatal:", err);
  process.exit(1);
});
