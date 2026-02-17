/**
 * Recompute pick_score and derive tier for all posts from existing sub-scores.
 * No API calls — uses existing data from the DB.
 *
 * For posts that already have a tier, recomputes pick_score from the tier.
 * For posts without a tier, derives one from sub-scores and sets pick_score.
 *
 * Usage: npx tsx scripts/recompute-scores.ts
 */

import Database from "better-sqlite3";
import { tierToPickScore, type Tier } from "../src/lib/ai/llm";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// Migration: add new columns if missing
try { sqlite.exec(`ALTER TABLE ai_analysis ADD COLUMN tier TEXT`); } catch { /* exists */ }
try { sqlite.exec(`ALTER TABLE ai_analysis ADD COLUMN vibe_tags TEXT`); } catch { /* exists */ }

const posts = sqlite.prepare(`
  SELECT post_id, novelty_score, ambition_score, usefulness_score, pick_score as old_score, tier
  FROM ai_analysis
  WHERE novelty_score IS NOT NULL AND ambition_score IS NOT NULL AND usefulness_score IS NOT NULL
`).all() as Array<{
  post_id: number;
  novelty_score: number;
  ambition_score: number;
  usefulness_score: number;
  old_score: number;
  tier: string | null;
}>;

console.log(`Recomputing scores for ${posts.length} posts...`);

const update = sqlite.prepare(`UPDATE ai_analysis SET pick_score = ?, tier = ? WHERE post_id = ?`);

/** Derive a tier from the average of sub-scores (1-10) */
function deriveTierFromSubScores(novelty: number, craft: number, appeal: number): Tier {
  const avg = (novelty + craft + appeal) / 3;
  if (avg >= 8) return "gem";
  if (avg >= 6.5) return "banger";
  if (avg >= 4.5) return "solid";
  if (avg >= 3) return "mid";
  return "pass";
}

const tierCounts: Record<string, number> = {};
const changes: { id: number; old: number; new_: number; tier: string }[] = [];

const doAll = sqlite.transaction(() => {
  for (const p of posts) {
    let tier: Tier;
    if (p.tier && ["gem", "banger", "solid", "mid", "pass"].includes(p.tier)) {
      tier = p.tier as Tier;
    } else {
      tier = deriveTierFromSubScores(p.novelty_score, p.ambition_score, p.usefulness_score);
    }

    const newScore = tierToPickScore(tier);
    update.run(newScore, tier, p.post_id);
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    changes.push({ id: p.post_id, old: p.old_score, new_: newScore, tier });
  }
});

doAll();

// Print tier distribution
console.log("\nTier distribution:");
for (const tier of ["gem", "banger", "solid", "mid", "pass"]) {
  const count = tierCounts[tier] || 0;
  const pct = changes.length > 0 ? ((count / changes.length) * 100).toFixed(1) : "0.0";
  const bar = "█".repeat(Math.round(count / 3));
  console.log(`  ${tier.toUpperCase().padEnd(6)}: ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
}

const avg = changes.reduce((s, c) => s + c.new_, 0) / changes.length;
console.log(`\nAvg pick_score: ${avg.toFixed(1)}`);
console.log(`Min: ${Math.min(...changes.map(c => c.new_))}  Max: ${Math.max(...changes.map(c => c.new_))}`);
console.log(`\nDone. ${changes.length} scores updated.`);
