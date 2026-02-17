/**
 * Batch re-score existing posts using data already in the DB.
 * Sends multiple posts per LLM call for efficiency + better relative calibration.
 *
 * Usage:
 *   npx tsx scripts/rescore.ts                  # all posts with existing analysis
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
import { computePickScore } from "../src/lib/ai/llm";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });

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
  novelty_score: number;
  craft_score: number;
  appeal_score: number;
  pick_reason: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: { limit?: number; postIds?: number[]; dryRun: boolean; batchSize: number } = {
    dryRun: false,
    batchSize: 10,
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
    }
    i++;
  }
  return flags;
}

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

  return `Score these ${posts.length} Show HN projects on three dimensions. You're seeing them together — score them RELATIVE to each other and to all Show HN projects generally.

${projectList}

Return a JSON object with a "scores" array, one entry per project IN ORDER:
{
  "scores": [
    { "id": <post_id>, "novelty_score": 1-10, "craft_score": 1-10, "appeal_score": 1-10, "pick_reason": "one sentence" },
    ...
  ]
}

SCORING GUIDE — use the FULL 1-10 range. Target distribution PER DIMENSION across all projects:
  1-2: ~10% (truly weak/generic)
  3-4: ~25% (below average)
  5-6: ~30% (average/decent)
  7-8: ~25% (strong/impressive)
  9-10: ~10% (exceptional/best-in-class)

⚠️ THE #1 MISTAKE: Clustering everything at 4-6. BE BOLD. You have ${posts.length} projects — spread the scores! A generic AI wrapper is a 2, not a 4. A playable synth in the browser is an 8-9, not a 7.

NOVELTY — "Have I seen this before?"
  9-10: Fundamentally new concept. Nothing like it exists.
  7-8: Chess engine in 2KB. Real-time bot attack viz. Genuinely surprising.
  5-6: Interesting twist. Fresh combo of known ideas.
  3-4: Derivative with minor differentiator. Predictable.
  1-2: Yet another todo/CRM/dashboard/AI wrapper clone.

CRAFT — "How impressive is the execution?"
  9-10: Masterful engineering. Systems that shouldn't be possible.
  7-8: Deep systems work. Polished UI/UX. Production-grade infra.
  5-6: Competent, works as described. Standard stack used well.
  3-4: Rough edges. Copy-paste architecture. Bare minimum.
  1-2: Minimal wrapper. Tutorial-level. Broken/no demo.

APPEAL — "Would someone be excited to discover this?"
  9-10: Instant viral appeal. Everyone wants to try it now.
  7-8: Devs immediately want it. Fills a real gap. Compelling demo.
  5-6: Useful for niche. Decent with existing alternatives.
  3-4: Hard to get excited about.
  1-2: No demo. Buzzword pitch. No "aha moment."

IMPORTANT: Good enterprise/infra tools solving real pain = 7-8 on Appeal. Score dimensions INDEPENDENTLY.
Within this batch, actively differentiate — not every project deserves the same score.

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
      novelty_score: Number(s.novelty_score) || 3,
      craft_score: Number(s.craft_score) || 3,
      appeal_score: Number(s.appeal_score) || 3,
      pick_reason: String(s.pick_reason || ""),
    }));
  } catch (err) {
    console.error("  API error:", (err as Error).message);
    return [];
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
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
  const batches = Math.ceil(posts.length / flags.batchSize);

  console.log(`[rescore] ${posts.length} posts, batch size ${flags.batchSize} → ${batches} API calls`);
  if (flags.dryRun) console.log("[rescore] DRY RUN — no writes");

  let processed = 0;
  let errors = 0;

  for (let b = 0; b < batches; b++) {
    const batch = posts.slice(b * flags.batchSize, (b + 1) * flags.batchSize);
    const batchLabel = `[${b + 1}/${batches}]`;
    
    const results = await rescoreBatch(batch);

    if (results.length === 0) {
      errors += batch.length;
      console.log(`  ${batchLabel} ✗ Entire batch failed`);
      continue;
    }

    // Map results by id for lookup
    const resultMap = new Map(results.map((r) => [r.id, r]));

    for (const post of batch) {
      const result = resultMap.get(post.id);
      if (!result) {
        errors++;
        console.log(`  ${batchLabel} ✗ ${post.id}: Missing from response`);
        continue;
      }

      const novelty = clamp(result.novelty_score, 1, 10);
      const craft = clamp(result.craft_score, 1, 10);
      const appeal = clamp(result.appeal_score, 1, 10);
      const pickScore = computePickScore(novelty, appeal, craft);
      const pickReason = result.pick_reason || post.pick_reason || "";

      if (flags.dryRun) {
        console.log(`  ${batchLabel} [dry] ${post.id} | N:${novelty} C:${craft} A:${appeal} → ${pickScore} | ${post.title.substring(0, 50)}`);
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
        console.log(`  ${batchLabel} ✓ ${post.id} | N:${novelty} C:${craft} A:${appeal} → ${pickScore} | ${post.title.substring(0, 50)}`);
      }
      processed++;
    }

    // Rate limit between batches
    if (b < batches - 1) {
      await new Promise((r) => setTimeout(r, RATE_DELAY));
    }
  }

  console.log(`\n[rescore] Done. ${processed} scored, ${errors} errors.`);

  // Print distribution
  const allScores = sqlite
    .prepare("SELECT pick_score FROM ai_analysis WHERE pick_score IS NOT NULL")
    .all() as { pick_score: number }[];

  const buckets: Record<string, number> = {};
  for (const { pick_score } of allScores) {
    const b = Math.floor(pick_score / 5) * 5;
    buckets[`${b}-${b + 4}`] = (buckets[`${b}-${b + 4}`] || 0) + 1;
  }

  console.log("\nFinal distribution:");
  for (const [range, cnt] of Object.entries(buckets).sort()) {
    const bar = "█".repeat(Math.round(cnt / 5));
    console.log(`  ${range}: ${String(cnt).padStart(4)} ${bar}`);
  }

  // Sub-score stats
  const stats = sqlite.prepare(`
    SELECT 
      ROUND(AVG(novelty_score),2) as avg_n,
      ROUND(AVG(ambition_score),2) as avg_c,
      ROUND(AVG(usefulness_score),2) as avg_a,
      ROUND(AVG(pick_score),1) as avg_pick
    FROM ai_analysis WHERE pick_score IS NOT NULL
  `).get() as any;
  console.log(`\nAvg sub-scores: N=${stats.avg_n} C=${stats.avg_c} A=${stats.avg_a} → Pick=${stats.avg_pick}`);
}

main().catch((err) => {
  console.error("[rescore] Fatal:", err);
  process.exit(1);
});
