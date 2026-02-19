/**
 * Batch re-score existing posts using data already in the DB.
 * Default: vision mode — one post at a time with screenshot for best accuracy.
 * Use --text-only for fast batch mode (multiple posts per call, no screenshots).
 *
 * Usage:
 *   npx tsx scripts/rescore.ts --limit 30       # rescore 30 posts with screenshots (default)
 *   npx tsx scripts/rescore.ts --text-only      # batch mode, no screenshots (faster/cheaper)
 *   npx tsx scripts/rescore.ts --batch 15       # 15 posts per API call (text-only mode)
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
  page_content: string | null;
  readme_content: string | null;
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
    vision: true,
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
    } else if (args[i] === "--text-only") {
      flags.vision = false;
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

  return `You're a sharp, opinionated tech writer reviewing Show HN projects. Classify each on its own merits.

${projectList}

Return a JSON object with a "scores" array, one entry per project IN ORDER:
{
  "scores": [
    { "id": <post_id>, "tier": "gem|banger|solid|mid|pass", "vibe_tags": ["up to 3 tags"], "highlight": "2-3 sentence editorial take" },
    ...
  ]
}

TIER GUIDE — read all five before deciding. When in doubt, go lower.
  gem:    You'd text this link to a friend right now. Requires genuinely novel idea AND
          impressive execution AND broad appeal — all three together. If debating gem
          vs banger, it's a banger.
  banger: Clear "oh that's cool" moment that most developers would appreciate. Needs both
          an interesting idea AND strong execution — not either/or. The project must do
          something that isn't already well-served by established tools in the space.
          A complex architecture on a common problem is not enough — sophistication is
          expected, not a differentiator. If you've seen three similar tools this week
          on HN, it's solid no matter how well-built this one is.
          If you're debating between banger and solid, it's a solid.
  solid:  Competent project with at least one interesting angle — a clever technique, a
          fresh take on the problem, or a notably well-crafted implementation. You'd use
          it if you had the problem but wouldn't go out of your way to tell someone.
          If you can't name one specific thing that's *interesting*, it's mid.
  mid:    Works but doesn't stand out. Applies to: derivative idea where a well-known tool
          already does this, unremarkable execution, crowded category with no clear
          differentiation, or an embryonic product competing against established tools.
          A README full of buzzwords without matching implementation quality belongs here.
          Most "yet another X" projects belong here, even if competently built.
          Mid is not an insult — it's the honest middle of the bell curve.
  pass:   No substance. Generic, broken, tutorial-level clone, empty landing page, blog
          post masquerading as a product, or a feature count without real depth (e.g. "100+
          tools" that each wrap a library function).

REFERENCE EXAMPLES:
  gem:    "Windows 98½" — pixel-accurate retro desktop running real sites. Novel + masterful craft + viral = gem.
  banger: "HiddenState" — ML news via cross-source convergence scoring. Clever + useful but still a digest = banger.
  solid:  "ContextLedger" — AI session context handoff CLI. Real problem, decent engineering, no "oh cool" moment = solid.
  mid:    "Klovr" — HTML-to-Markdown for LLMs. JinaAI/Firecrawl/Pandoc already do this well = mid.
  pass:   "Free Dev Tools" — JSON formatter + base64 encoder on GitHub Pages. CyberChef exists = pass.

COMMON FALSE POSITIVES — these look like bangers but aren't:
  Complex architecture, crowded category → solid:
    "CodeGraph CLI" — tree-sitter AST + SQLite graph + vector embeddings + multi-agent
    tools for codebase Q&A. Sounds impressive, but "chat with your codebase" has dozens
    of tools (Cursor, Continue, Sourcegraph Cody, etc.). Layering more tech onto a
    solved problem isn't a "cool moment" — it's table stakes. Solid.
  Orchestration of existing tools → solid:
    "tspub" — bundles esbuild, type-checking, and npm publish into one CLI with
    validation gates and auto-rollback. Useful, genuinely good DX — but it's wiring
    together things that already exist. Nobody would text this to a friend. Solid.
  AI-adjacent wrapper → solid:
    "iherb-CLI" — headless Chrome scraping a supplement store, outputs markdown for
    LLM agents. Smart hack, but it's a scraper for one website. "AI-optimized" doesn't
    automatically upgrade the tier. Solid.
  Pretty product in a crowded space → solid:
    "Palettepoint.com" — AI color palettes from text descriptions or images, with CSS
    and Tailwind export. Clean, but Coolors, Adobe Color, Khroma and several AI
    alternatives already exist. Nice product, no differentiator. Solid.
  Fun novelty, no staying power → solid:
    "Google Maps in Your Terminal" — renders vector tiles as ASCII art, searchable and
    pannable. Technically neat and fun to poke at for five minutes, but it's a novelty
    with no real use case. If your own honest take includes "mostly a novelty," that's
    solid, not banger.
  Your own review undermines the tier → downgrade:
    If your highlight says "needs more examples," "unclear implementation," "will depend
    on adoption," or "more of an experiment" — trust your own caveats. A project that
    needs caveats in every sentence isn't giving you an "oh that's cool" moment.

SOLID vs MID — many projects rated solid should actually be mid. Ask: "does this project
have at least one interesting idea or angle, even if niche?" If yes, solid. If it's
competent but you can't name a single thing that's *interesting* about it, that's mid.
  These look like solids but are actually mid:
  Free/no-signup clone of an established tool → mid:
    "AI Background Remover" — no signup, no watermarks, runs in browser. Clean UX, but
    remove.bg, PhotoRoom, and a dozen clones already do this. Being free doesn't make
    an idea interesting. Mid.
  Boilerplate / starter kit / reference implementation → mid:
    "Production-Ready NestJS Back End" — multi-tenancy, event-driven, OpenTelemetry.
    These are standard patterns for SaaS backends. A well-organized teaching repo is
    not a product — it's a template. Mid.
  GUI wrapper around a CLI tool → mid:
    "Macabolic" — native macOS UI for yt-dlp. SwiftUI + Menu Bar mode is nice, but
    yt-dlp does the work. Wrapping an existing tool in a GUI is expected, not
    interesting. Mid.
  Curated list / directory / collection → mid:
    "Shopify Sections" — drop-in Liquid components for Shopify themes. Useful, but
    it's a collection of boilerplate. No novel technique, no "oh cool" moment. Mid.
  Calculator / single-page utility → mid:
    "How Much Ad Money Targets You" — enter your age, get a dollar estimate. Viral
    landing page, but there's no depth, no tool, no technology worth discussing. Mid.

VIBE TAGS — pick 1-3 that genuinely fit (don't force them):
  "Rabbit Hole" "Dark Horse" "Eye Candy" "Wizardry" "Big Brain" "Crowd Pleaser"
  "Niche Gem" "Bold Bet" "Ship It" "Zero to One" "Cozy" "Slick" "Solve My Problem"

HIGHLIGHT — 2-3 sentences, specific, opinionated. This is the most important field.
  NEVER start with "A [adjective] [noun] that..." — vary your sentence structure.
  BANNED phrases: "polished", "well-executed", "addresses a clear need", "fills a real
  gap", "production-ready", "developer-focused", "seamlessly", "thoughtful", "leverages".
  Name actual features or techniques. Have a point of view.
  For mid/pass: be direct about why it doesn't stand out.

Don't penalize good enterprise/infra projects — a well-built database tool solving real
pain is a banger even if it's not "fun."

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
    // Prefer stored page_content (original Playwright render), fall back to summary/story_text
    const pageContent = post.page_content || post.summary || post.story_text?.replace(/<[^>]*>/g, " ").slice(0, 3000) || post.title;

    const { result } = await analyzePost(
      post.title,
      post.url,
      pageContent,
      post.story_text,
      post.readme_content || undefined,
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
           p.page_content, p.readme_content,
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
