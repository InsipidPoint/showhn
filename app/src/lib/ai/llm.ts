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

SCORING GUIDE — use the FULL 1-10 range. Aim for a bell curve centered around 5.

NOVELTY — "Have I seen this before?"
  High (7-9): Chess engine in 2KB. Visualizing transformer internals in-browser. Real-time bot attack visualization. A genuinely new approach to an old problem.
  Medium (4-6): Interesting twist on existing concept. Combines known ideas in a fresh way. Solid but not surprising.
  Low (1-3): Another todo app. "X but in Rust/Go." Yet another AI wrapper, CRM, dashboard, or landing page builder. Clone of well-known product with no meaningful differentiator.

CRAFT — "How impressive is the execution?" (replaces ambition)
  This rewards BOTH elegant small projects AND ambitious large ones. Quality of engineering, not just scope.
  High (7-9): 2KB chess engine (extreme constraint mastery). Snowflake emulator in Rust (deep systems work). Polished UI with thoughtful UX. Real-time system with complex state management. Production-grade infra solving hard distributed systems problems.
  Medium (4-6): Well-structured project, works as described, competent engineering. Standard web stack used effectively.
  Low (1-3): Minimal wrapper around an API. Tutorial-level code. Broken or barely functional demo. README-only with no working product.

APPEAL — "Would someone be excited to discover this?" (replaces usefulness)
  This captures BOTH practical value AND delight/fun/coolness. Ask: "If I shared this link, would someone say 'oh cool' and actually click it?"
  High (7-9): Moog synthesizer you can play in browser (instant fun). SQL traffic viewer (devs immediately want this). LLM search over Epstein files (compelling + topical). Self-hosted Firebase alternative (fills real gap). Interactive data visualization that reveals something surprising.
  Medium (4-6): Useful for a niche audience. Decent developer tool with existing alternatives. Interesting but requires setup/commitment to appreciate.
  Low (1-3): Generic SaaS with no demo. Dry enterprise tool with buzzword-heavy README and no clear "aha moment." Library with narrow use case and no visual/interactive element. "AI governance framework" that reads like a corporate pitch.

IMPORTANT BALANCE: Don't penalize genuinely good enterprise/infrastructure projects — a well-executed database tool or security product that clearly solves a real pain point should score well on Appeal even if it's not "fun." The question is whether it makes someone go "oh, I need this" — that counts just as much as "oh, this is cool."

Differentiate! If everything scores 5, you're not being helpful. Spread your scores across the full range.
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
 * Compute a 50-100 composite pick score from the three AI sub-scores (each 1-10).
 * 
 * The LLM (gpt-5-mini) practically scores in a 2-8 range despite being told to use 1-10.
 * We map the weighted average so that:
 *   - avg 2 (minimum real scores) → ~55
 *   - avg 5 (typical project)     → ~72
 *   - avg 7 (strong project)      → ~83
 *   - avg 8 (top projects)        → ~89
 *   - avg 9+ (rare exceptional)   → ~95-100
 *
 * Formula: 50 + (raw - 1) * (55 / 9)  — slightly steeper slope
 * Dimensions: Novelty (how fresh), Craft (how well-built), Appeal (how exciting to discover).
 * DB columns: novelty_score, ambition_score (=craft), usefulness_score (=appeal).
 */
export function computePickScore(novelty: number, usefulness: number, ambition: number): number {
  //Args: novelty, appeal (usefulness col), craft (ambition col)
  const raw = novelty * 0.35 + usefulness * 0.35 + ambition * 0.30;
  const score = 50 + (raw - 1) * (55 / 9);
  return Math.round(Math.min(100, Math.max(50, score)));
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
