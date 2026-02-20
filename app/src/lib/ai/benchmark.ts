/**
 * Benchmark calibration set — 15 real Show HN posts (3 per tier) with
 * verified tier assignments and explanations. Injected into every analysis
 * call to anchor the model's judgment against known-good examples.
 */

import type { Tier } from "./llm";

export type BenchmarkEntry = {
  postId: number;
  title: string;
  tier: Tier;
  reason: string;
};

export const BENCHMARK_ENTRIES: BenchmarkEntry[] = [
  // ── GEM ──
  {
    postId: 46994974,
    title: "YOR – open-source bimanual mobile robot for <$10k",
    tier: "gem",
    reason:
      "Genuine hardware category disruption. Replaces proprietary systems with a fully open-source build list. \"Why didn't this exist?\" energy. You'd send this to any engineer who builds robots.",
  },
  {
    postId: 47014500,
    title: "Sameshi – a ~1200 Elo chess engine that fits within 2KB",
    tier: "gem",
    reason:
      "Pure demoscene-grade constraint craft. Any programmer shares this regardless of whether they play chess. The Elo measurement methodology is rigorous, not hand-waved.",
  },
  {
    postId: 47088108,
    title: "Open-source MCP servers making every country's law searchable by AI",
    tier: "gem",
    reason:
      "Solves a genuine AI hallucination failure mode (legal questions) with real infrastructure. Zero-to-one: before this, AI either hallucinated law or said \"consult a lawyer.\"",
  },

  // ── BANGER ──
  {
    postId: 47040375,
    title: "Free Alternative to Wispr Flow, Superwhisper, and Monologue",
    tier: "banger",
    reason:
      "Replaces three $10/month SaaS tools with a free, open-source build that matches the flagship feature (Deep Context). Verified working. Clear \"oh that's good, and it's free.\"",
  },
  {
    postId: 47022745,
    title: "Pangolin: Open-source identity-based VPN (Twingate/Zscaler alternative)",
    tier: "banger",
    reason:
      "Real architectural insight: resource-centric P2P vs device-centric (Tailscale) or central relay (Zscaler). Genuine differentiation, live cloud offering. Not gem because enterprise networking is well-funded.",
  },
  {
    postId: 47019133,
    title: "Off Grid – Run AI text, image gen, vision offline on your phone",
    tier: "banger",
    reason:
      "Genuinely comprehensive offline AI suite with hardware-accelerated inference on both platforms. Real benchmarks. On Google Play. Not gem because \"local LLM mobile apps\" is a known category.",
  },

  // ── SOLID ──
  {
    postId: 47075124,
    title: "Micasa – track your house from the terminal",
    tier: "solid",
    reason:
      "VisiData-inspired modal TUI for home management — interesting domain for a terminal app. Privacy-first, thoughtful keyboard workflows. Not banger because audience is narrow (terminal users who own property).",
  },
  {
    postId: 47011567,
    title: "SQL-tap – Real-time SQL traffic viewer for PostgreSQL and MySQL",
    tier: "solid",
    reason:
      "Native wire protocol parsing means genuinely zero code changes. Real tool, ships today. Not banger because \"SQL query inspector\" is a solved category (Datadog, pgAdmin).",
  },
  {
    postId: 47072863,
    title: "An encrypted, local, cross-platform journaling app",
    tier: "solid",
    reason:
      "Real crypto with clever key management (O(1) key wrapping). Thoughtful rebuild of an unmaintained predecessor. Not banger because local journaling apps are crowded.",
  },

  // ── MID ──
  {
    postId: 47025220,
    title: "DSCI – Dead Simple CI",
    tier: "mid",
    reason:
      "Real project with real integrations, but competes directly with Drone, Woodpecker, Jenkins. \"No YAML\" isn't a moat. Competent but not differentiated. Pattern: built something real in a crowded space.",
  },
  {
    postId: 47036063,
    title: "Maths, CS and AI Compendium",
    tier: "mid",
    reason:
      "Genuine effort, real content. But static Markdown files — no notebooks, no exercises. Dozens of similar GitHub repos exist. Pattern: useful educational content, but reference != product.",
  },
  {
    postId: 47041288,
    title: "Deep Research for Flights",
    tier: "mid",
    reason:
      "Pleasant UX for a real friction point. But Google Flights flex dates, Kayak Explore already handle this. No evidence of better data or novel routing. Pattern: AI wrapper on a solved problem.",
  },

  // ── PASS ──
  {
    postId: 46978700,
    title: "NOOR – A Sovereign AI developed on a smartphone under siege in Yemen",
    tier: "pass",
    reason:
      "Compelling narrative, zero technical substance. A crypto fundraiser with vague claims. No code, no demo, no verifiable output. Pattern: emotional story as a substitute for a project.",
  },
  {
    postId: 47031605,
    title: "Free Browser-Based Dev Tools (No Signup, Client-Side)",
    tier: "pass",
    reason:
      "Every tool exists on CyberChef, in browser DevTools, and on 50 other static sites. No chaining, no advanced features. Pattern: zero differentiation from free dominant alternatives.",
  },
  {
    postId: 47057956,
    title: "Free printable micro-habit tracker inspired by Atomic Habits",
    tier: "pass",
    reason:
      "Works fine. But a Google Sheets template does this identically. Nothing to curate — no interesting technical choice, no novel UX. Pattern: single-gimmick utility any spreadsheet already does.",
  },
];

/** Format benchmark entries as calibration context for the AI prompt. */
export function buildBenchmarkContext(): string {
  const grouped: Record<string, BenchmarkEntry[]> = {};
  for (const entry of BENCHMARK_ENTRIES) {
    if (!grouped[entry.tier]) grouped[entry.tier] = [];
    grouped[entry.tier].push(entry);
  }

  const tierOrder: Tier[] = ["gem", "banger", "solid", "mid", "pass"];
  const sections: string[] = [];

  for (const tier of tierOrder) {
    const entries = grouped[tier] || [];
    const lines = entries.map(
      (e) => `  * "${e.title}" — ${e.reason}`
    );
    sections.push(`${tier.toUpperCase()}:\n${lines.join("\n")}`);
  }

  return `## CALIBRATION REFERENCES — real projects with confirmed tiers. Use these to anchor your judgment.\n\n${sections.join("\n\n")}`;
}
