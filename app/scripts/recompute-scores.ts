/**
 * Recompute pick_score for all posts using the updated computePickScore formula.
 * No API calls — uses existing sub-scores from the DB.
 * 
 * Usage: npx tsx scripts/recompute-scores.ts
 */

import Database from "better-sqlite3";
import { computePickScore } from "../src/lib/ai/llm";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

const posts = sqlite.prepare(`
  SELECT post_id, novelty_score, ambition_score, usefulness_score, pick_score as old_score
  FROM ai_analysis
  WHERE novelty_score IS NOT NULL AND ambition_score IS NOT NULL AND usefulness_score IS NOT NULL
`).all() as Array<{
  post_id: number;
  novelty_score: number;
  ambition_score: number;
  usefulness_score: number;
  old_score: number;
}>;

console.log(`Recomputing pick_score for ${posts.length} posts...`);

const update = sqlite.prepare(`UPDATE ai_analysis SET pick_score = ? WHERE post_id = ?`);

const changes: { id: number; old: number; new_: number; delta: number }[] = [];

const doAll = sqlite.transaction(() => {
  for (const p of posts) {
    // Args: novelty, appeal (usefulness col), craft (ambition col)
    const newScore = computePickScore(p.novelty_score, p.usefulness_score, p.ambition_score);
    update.run(newScore, p.post_id);
    changes.push({ id: p.post_id, old: p.old_score, new_: newScore, delta: newScore - p.old_score });
  }
});

doAll();

// Print distribution
const buckets: Record<string, number> = {};
for (const c of changes) {
  const b = Math.floor(c.new_ / 5) * 5;
  const key = `${b}-${b + 4}`;
  buckets[key] = (buckets[key] || 0) + 1;
}

console.log("\nNew distribution:");
for (const [range, cnt] of Object.entries(buckets).sort()) {
  const bar = "█".repeat(Math.round(cnt / 5));
  console.log(`  ${range}: ${String(cnt).padStart(4)} ${bar}`);
}

const avg = changes.reduce((s, c) => s + c.new_, 0) / changes.length;
const avgDelta = changes.reduce((s, c) => s + c.delta, 0) / changes.length;
console.log(`\nAvg score: ${avg.toFixed(1)}  Avg delta: ${avgDelta > 0 ? "+" : ""}${avgDelta.toFixed(1)}`);
console.log(`Min: ${Math.min(...changes.map(c => c.new_))}  Max: ${Math.max(...changes.map(c => c.new_))}`);
console.log(`\nDone. ${changes.length} scores updated.`);
