/**
 * Batch re-score existing posts using data already in the DB.
 * Sends multiple posts per LLM call for tier classification + vibe tags + highlight.
 *
 * With --vision flag, processes one post at a time and sends the screenshot
 * from disk to the model for visual analysis (no browser needed).
 *
 * Usage:
 *   npx tsx scripts/rescore.ts                  # batch mode (text only)
 *   npx tsx scripts/rescore.ts --vision         # single-post mode with screenshots
 *   npx tsx scripts/rescore.ts --limit 50       # first 50 posts
 *   npx tsx scripts/rescore.ts --batch 15       # 15 posts per API call (default 10)
 *   npx tsx scripts/rescore.ts --post 123 456   # specific post IDs
 *   npx tsx scripts/rescore.ts --dry-run        # preview without writing
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
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

const RATE_DELAY = parseInt(process.env.RESCORE_DELAY || "500", 10);

type PostRow = {
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
};

type ScoreResult = {
  id: number;
  tier: Tier;
  vibe_tags: string[];
  highlight: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: { limit?: number; postIds?: number[]; dryRun: boolean; batchSize: number; vision: boolean } = {
    dryRun: false,
    batchSize: 10,
    vision: false,
  };
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--limit" && args[i + 1]) {
      flags.limit = parseInt(args[++i], 10);
    } else if (args[i] === "--batch" && args[i + 1]) {
      flags.batchSize = parseInt(args[++i], 10);
    } else if (args[i] === "--post") {
      flags.postIds = [];
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags.postIds.push(parseInt(args[++i], 10));
      }
    } else if (args[i] === "--dry-run") {
      flags.dryRun = true;
    } else if (args[i] === "--vision") {
      flags.vision = true;
    }
    i++;
  }
  return flags;
}

// ─── Batch mode (text-only, multiple posts per call) ─────────────────────────

function formatPost(post: PostRow, idx: number): string {
  const techStack = post.tech_stack ? JSON.parse(post.tech_stack) : [];
  const tags = post.tags ? JSON.parse(post.tags) : [];

  return `[PROJECT ${idx + 1}] (id: ${post.id})
Title: ${post.title}
URL: ${post.url || "N/A (text-only post)"}
HN: ${post.points} pts, ${post.comments} comments
${post.summary ? `Summary: ${post.summary}` : ""}
${post.category ? `Category: ${post.category}` : ""}
${techStack.length ? `Tech: ${techStack.join(", ")}` : ""}
${post.target_audience ? `Audience: ${post.target_audience}` : ""}
${tags.length ? `Tags: ${tags.join(", ")}` : ""}
${post.story_text ? `Description: ${post.story_text.replace(/<[^>]*>/g, " ").slice(0, 300)}` : ""}`.trim();
}

function buildBatchPrompt(posts: PostRow[]): string {
  const projectList = posts.map((p, i) => formatPost(p, i)).join("\n\n---\n\n");

  return `You're a sharp, opinionated tech writer. Classify these ${posts.length} Show HN projects. You're seeing them together — judge them RELATIVE to each other.

${projectList}

Return a JSON object with a "scores" array, one entry per project IN ORDER:
{
  "scores": [
    { "id": <post_id>, "tier": "gem|banger|solid|mid|pass", "vibe_tags": ["up to 3 tags"], "highlight": "2-3 sentence editorial take" },
    ...
  ]
}

TIER GUIDE — classify each project:
  gem    (~5%): Exceptional. Mass-share worthy. Novel idea OR masterful execution OR instant viral appeal.
  banger (~15%): Really compelling. Clear "oh that's cool" moment. Strong execution or fills a real gap.
  solid  (~40%): Good work. Does what it says. Interesting to its niche.
  mid    (~30%): Nothing special. Works but doesn't excite. Derivative or unremarkable.
  pass   (~10%): Generic/broken/no substance. AI wrapper clone, empty landing page, tutorial-level.

VIBE TAGS — pick 1-3 that genuinely fit (don't force them):
  "Rabbit Hole" "Dark Horse" "Eye Candy" "Wizardry" "Big Brain" "Crowd Pleaser"
  "Niche Gem" "Bold Bet" "Ship It" "Zero to One" "Cozy" "Slick" "Solve My Problem"

HIGHLIGHT — 2-3 sentences. Specific, not generic. Mention actual features or techniques.
  For mid/pass: honestly say why it doesn't stand out.
  For gem/banger: what specifically makes it exceptional.

You have ${posts.length} projects — DIFFERENTIATE. Not everything is "solid". Be bold with your tiers.
Good enterprise/infra tools solving real pain = banger even if not "fun."

Return ONLY valid JSON, no markdown.`;
}

async function rescoreBatch(posts: PostRow[]): Promise<ScoreResult[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = buildBatchPrompt(posts);

  try {
    const response = await client.chat.completions.create({
      model: process.env.ANALYSIS_MODEL || "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 500 * posts.length,
      response_format: { type: "json_object" },
    });
    const raw = response.choices[0]?.message?.content || "";
    if (!raw) {
      console.error("  Empty response. Finish reason:", response.choices[0]?.finish_reason);
      return [];
    }
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed.scores)) {
      console.error("  Response missing 'scores' array");
      return [];
    }

    return parsed.scores.map((s: any) => ({
      id: Number(s.id),
      tier: parseTier(s.tier),
      vibe_tags: parseVibeTags(s.vibe_tags),
      highlight: String(s.highlight || ""),
    }));
  } catch (err) {
    console.error("  API error:", (err as Error).message);
    return [];
  }
}

// ─── Vision mode (one post at a time, with screenshot) ──────────────────────

function loadScreenshot(postId: number): string | undefined {
  const screenshotPath = path.join(SCREENSHOT_DIR, `${postId}.webp`);
  if (fs.existsSync(screenshotPath)) {
    return fs.readFileSync(screenshotPath).toString("base64");
  }
  return undefined;
}

async function rescoreWithVision(post: PostRow): Promise<ScoreResult | null> {
  try {
    const screenshotBase64 = loadScreenshot(post.id);
    const pageContent = post.summary || post.story_text?.replace(/<[^>]*>/g, " ").slice(0, 3000) || post.title;

    const { result } = await analyzePost(
      post.title,
      post.url,
      pageContent,
      post.story_text,
      undefined,
      screenshotBase64
    );

    return {
      id: post.id,
      tier: result.tier,
      vibe_tags: result.vibe_tags,
      highlight: result.highlight,
    };
  } catch (err) {
    console.error(`  ✗ ${post.id}: ${(err as Error).message}`);
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function saveResult(postId: number, result: ScoreResult, existingPickReason: string | null) {
  const pickScore = tierToPickScore(result.tier);
  db.update(schema.aiAnalysis)
    .set({
      tier: result.tier,
      vibeTags: JSON.stringify(result.vibe_tags),
      pickReason: result.highlight || existingPickReason || "",
      pickScore,
      analyzedAt: Math.floor(Date.now() / 1000),
      model: process.env.ANALYSIS_MODEL || "gpt-5-mini",
    })
    .where(eq(schema.aiAnalysis.postId, postId))
    .run();
}

async function main() {
  const flags = parseArgs();

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

  const posts = sqlite.prepare(query).all(...params) as PostRow[];

  let processed = 0;
  let errors = 0;
  const tierCounts: Record<string, number> = {};

  if (flags.vision) {
    // Vision mode: one post at a time, with screenshot
    console.log(`[rescore] Vision mode: ${posts.length} posts, 1 per API call (with screenshots)`);
    if (flags.dryRun) console.log("[rescore] DRY RUN — no writes");

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const label = `[${i + 1}/${posts.length}]`;
      const hasScreenshot = fs.existsSync(path.join(SCREENSHOT_DIR, `${post.id}.webp`));

      const result = await rescoreWithVision(post);

      if (!result) {
        errors++;
        console.log(`  ${label} ✗ ${post.id}: Failed`);
      } else {
        const vibeStr = result.vibe_tags.length > 0 ? ` [${result.vibe_tags.join(", ")}]` : "";
        tierCounts[result.tier] = (tierCounts[result.tier] || 0) + 1;

        if (flags.dryRun) {
          console.log(`  ${label} [dry] ${post.id} | ${result.tier.toUpperCase().padEnd(6)}${hasScreenshot ? " 📸" : "   "}${vibeStr} | ${post.title.substring(0, 50)}`);
        } else {
          saveResult(post.id, result, post.pick_reason);
          console.log(`  ${label} ✓ ${post.id} | ${result.tier.toUpperCase().padEnd(6)}${hasScreenshot ? " 📸" : "   "}${vibeStr} | ${post.title.substring(0, 50)}`);
        }
        processed++;
      }

      // Rate limit
      if (i < posts.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_DELAY));
      }
    }
  } else {
    // Batch mode: multiple posts per call, text only
    const batches = Math.ceil(posts.length / flags.batchSize);
    console.log(`[rescore] Batch mode: ${posts.length} posts, batch size ${flags.batchSize} → ${batches} API calls`);
    if (flags.dryRun) console.log("[rescore] DRY RUN — no writes");

    for (let b = 0; b < batches; b++) {
      const batch = posts.slice(b * flags.batchSize, (b + 1) * flags.batchSize);
      const batchLabel = `[${b + 1}/${batches}]`;

      const results = await rescoreBatch(batch);

      if (results.length === 0) {
        errors += batch.length;
        console.log(`  ${batchLabel} ✗ Entire batch failed`);
        continue;
      }

      const resultMap = new Map(results.map((r) => [r.id, r]));

      for (const post of batch) {
        const result = resultMap.get(post.id);
        if (!result) {
          errors++;
          console.log(`  ${batchLabel} ✗ ${post.id}: Missing from response`);
          continue;
        }

        const vibeStr = result.vibe_tags.length > 0 ? ` [${result.vibe_tags.join(", ")}]` : "";
        tierCounts[result.tier] = (tierCounts[result.tier] || 0) + 1;

        if (flags.dryRun) {
          console.log(`  ${batchLabel} [dry] ${post.id} | ${result.tier.toUpperCase().padEnd(6)}${vibeStr} | ${post.title.substring(0, 50)}`);
        } else {
          saveResult(post.id, result, post.pick_reason);
          console.log(`  ${batchLabel} ✓ ${post.id} | ${result.tier.toUpperCase().padEnd(6)}${vibeStr} | ${post.title.substring(0, 50)}`);
        }
        processed++;
      }

      // Rate limit between batches
      if (b < batches - 1) {
        await new Promise((r) => setTimeout(r, RATE_DELAY));
      }
    }
  }

  console.log(`\n[rescore] Done. ${processed} scored, ${errors} errors.`);

  // Print tier distribution
  console.log("\nTier distribution:");
  for (const tier of TIERS) {
    const count = tierCounts[tier] || 0;
    const pct = processed > 0 ? ((count / processed) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round(count / 3));
    console.log(`  ${tier.toUpperCase().padEnd(6)}: ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  }
}

main().catch((err) => {
  console.error("[rescore] Fatal:", err);
  process.exit(1);
});
