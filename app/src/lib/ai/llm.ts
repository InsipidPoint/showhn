/**
 * Configurable LLM client — supports OpenAI and Anthropic.
 * Controlled via ANALYSIS_PROVIDER and ANALYSIS_MODEL env vars.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export type AnalysisResult = {
  summary: string;
  category: string;
  tech_stack: string[];
  target_audience: string;
  vibe_score: number;
  interest_score: number;
  novelty_score: number;
  ambition_score: number;   // mapped from craft_score
  usefulness_score: number; // mapped from appeal_score
  pick_reason: string;
  tags: string[];
};

const CATEGORIES = [
  "AI/ML",
  "Developer Tools",
  "SaaS",
  "Open Source",
  "Hardware",
  "Design",
  "Productivity",
  "Finance",
  "Health",
  "Education",
  "Social",
  "Gaming",
  "Security",
  "Data",
  "Infrastructure",
  "Other",
];

function buildPrompt(title: string, url: string | null, pageContent: string, storyText: string | null, readmeContent?: string): string {
  return `Analyze this Show HN project and return a JSON object.

Title: ${title}
URL: ${url || "N/A (text-only post)"}
${storyText ? `Author's description: ${storyText.replace(/<[^>]*>/g, " ").slice(0, 1000)}` : ""}

Page content (truncated):
${pageContent.slice(0, 3000)}
${readmeContent ? `\nGitHub README (truncated):\n${readmeContent.slice(0, 3000)}` : ""}

Return ONLY a JSON object with these fields:
{
  "summary": "One sentence: what it does and who it's for",
  "category": "One of: ${CATEGORIES.join(", ")}",
  "tech_stack": ["Array of detected technologies, frameworks, languages"],
  "target_audience": "Who would use this (e.g. 'Backend developers', 'Small business owners')",
  "vibe_score": 1-5 (1=weekend hack, 2=side project, 3=solid tool, 4=polished product, 5=serious startup),
  "novelty_score": 1-10 (How fresh or surprising is this?),
  "craft_score": 1-10 (How impressive is the execution?),
  "appeal_score": 1-10 (Would someone be excited to discover this?),
  "pick_reason": "One sentence explaining what makes this project noteworthy, or 'Nothing stands out' if generic",
  "tags": ["3-5 descriptive tags beyond the category"]
}

SCORING GUIDE — use the FULL 1-10 range with this target distribution per dimension:
  1-2: ~10% of projects (truly weak/generic)
  3-4: ~25% (below average)
  5-6: ~30% (average/decent)
  7-8: ~25% (strong/impressive)
  9-10: ~10% (exceptional/best-in-class)

⚠️ THE #1 MISTAKE: Clustering everything at 4-6. BE BOLD. A generic AI chatbot wrapper is a 2, not a 4. A playable synthesizer in the browser is an 8-9, not a 7. Differentiate aggressively.

NOVELTY — "Have I seen this before?"
  9-10: Fundamentally new concept. Nothing like it exists. Changes how you think about the problem space.
  7-8: Chess engine in 2KB. Visualizing transformer internals in-browser. Real-time bot attack visualization. Genuinely surprising approach.
  5-6: Interesting twist on existing concept. Combines known ideas in a fresh way.
  3-4: Derivative but with a minor differentiator. Somewhat predictable execution of a known idea.
  1-2: Another todo app. "X but in Rust/Go." Yet another AI wrapper, CRM, dashboard, landing page builder, or clone with zero innovation.

CRAFT — "How impressive is the execution?"
  Rewards BOTH elegant small projects AND ambitious large ones. Quality of engineering, not just scope.
  9-10: Masterful engineering. 2KB chess engine. Novel compiler. Systems that shouldn't be possible in this stack.
  7-8: Deep systems work (Snowflake emulator in Rust). Polished UI with thoughtful UX. Production-grade distributed systems.
  5-6: Well-structured, works as described, competent engineering. Standard stack used effectively.
  3-4: Works but rough edges. Copy-paste architecture. Limited error handling. Bare minimum effort.
  1-2: Minimal API wrapper. Tutorial-level code. Broken or barely functional demo. README-only with no working product.

APPEAL — "Would someone be excited to discover this?"
  Captures BOTH practical value AND delight/fun/coolness. "If I shared this link, would someone say 'oh cool' and actually click it?"
  9-10: Instant viral appeal. Everyone wants to try it right now. Moog synthesizer playable in browser.
  7-8: SQL traffic viewer devs immediately want. Self-hosted Firebase alternative filling a real gap. Interactive data viz revealing something surprising.
  5-6: Useful for a niche. Decent developer tool with existing alternatives.
  3-4: Might be useful to someone but hard to get excited about. Requires significant context to appreciate.
  1-2: Generic SaaS with no demo. Dry enterprise pitch with buzzword README. "AI governance framework" that reads like a corporate deck.

IMPORTANT: Don't penalize good enterprise/infra projects — a well-executed DB tool solving real pain is a 7-8 on Appeal ("I need this!") even if it's not "fun."

Score each dimension INDEPENDENTLY. A project can be high novelty but low craft, or low novelty but high appeal.

CALIBRATION REFERENCES — use these as anchors:
• LOW (~59): "PythonICO – Simple SVG Badges for PyPI Stats" → N:2 C:2 A:2. Generic utility, nothing novel, minimal craft, no excitement.
• MID (~76): "Kaneo – a project management tool which is not complicated" → N:4 C:6 A:6. Competent OSS tool, decent execution, useful but not surprising.
• HIGH (~92): "Emergent Field Explorer – interactive moiré with easy shareable URLs" → N:6 C:9 A:9. Interactive browser art, masterful execution, instant delight.
Score the new project relative to these anchors.

Be concise. Return ONLY valid JSON, no markdown fencing.`;
}

async function callOpenAI(prompt: string, model: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 1000,
    response_format: { type: "json_object" },
  });
  return response.choices[0]?.message?.content || "";
}

async function callAnthropic(prompt: string, model: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Compute a 55-100 composite pick score from the three AI sub-scores (each 1-10).
 * 
 * Piecewise linear mapping that stretches the crowded middle range:
 *   raw 1-3  → 55-62   (weak projects, compressed — few posts here)
 *   raw 3-5  → 62-74   (below average, decent spread)
 *   raw 5-7  → 74-88   (average-to-good, widest spread where most posts cluster)
 *   raw 7-10 → 88-100  (top tier, earned territory)
 *
 * Dimensions: Novelty (how fresh), Craft (how well-built), Appeal (how exciting to discover).
 * DB columns: novelty_score, ambition_score (=craft), usefulness_score (=appeal).
 */
export function computePickScore(novelty: number, usefulness: number, ambition: number): number {
  //Args: novelty, appeal (usefulness col), craft (ambition col)
  const raw = novelty * 0.35 + usefulness * 0.35 + ambition * 0.30;
  let score: number;
  if (raw <= 3) {
    score = 55 + (raw - 1) * 3.5;    // 1→55, 3→62
  } else if (raw <= 5) {
    score = 62 + (raw - 3) * 6;      // 3→62, 5→74
  } else if (raw <= 7) {
    score = 74 + (raw - 5) * 7;      // 5→74, 7→88
  } else {
    score = 88 + (raw - 7) * 4;      // 7→88, 10→100
  }
  return Math.round(Math.min(100, Math.max(55, score)));
}

function parseResult(raw: string): AnalysisResult {
  // Strip markdown fencing if present
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);

  const novelty_score = clamp(Number(parsed.novelty_score) || 3, 1, 10);
  // Accept both new (craft/appeal) and legacy (ambition/usefulness) field names
  const ambition_score = clamp(Number(parsed.craft_score ?? parsed.ambition_score) || 3, 1, 10);
  const usefulness_score = clamp(Number(parsed.appeal_score ?? parsed.usefulness_score) || 3, 1, 10);

  // Backward-compatible interest_score derived from average of sub-scores
  const avgScore = (novelty_score + ambition_score + usefulness_score) / 3;
  const interest_score = clamp(Math.round(avgScore / 2), 1, 5);

  return {
    summary: String(parsed.summary || ""),
    category: CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
    tech_stack: Array.isArray(parsed.tech_stack) ? parsed.tech_stack.map(String) : [],
    target_audience: String(parsed.target_audience || ""),
    vibe_score: clamp(Number(parsed.vibe_score) || 3, 1, 5),
    interest_score,
    novelty_score,
    ambition_score,
    usefulness_score,
    pick_reason: String(parsed.pick_reason || ""),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 5) : [],
  };
}

export async function analyzePost(
  title: string,
  url: string | null,
  pageContent: string,
  storyText: string | null,
  readmeContent?: string
): Promise<{ result: AnalysisResult; model: string }> {
  const provider = process.env.ANALYSIS_PROVIDER || "openai";
  const model = process.env.ANALYSIS_MODEL || "gpt-5-mini";
  const prompt = buildPrompt(title, url, pageContent, storyText, readmeContent);

  let raw: string;
  if (provider === "anthropic") {
    raw = await callAnthropic(prompt, model);
  } else {
    raw = await callOpenAI(prompt, model);
  }

  const result = parseResult(raw);
  return { result, model };
}
