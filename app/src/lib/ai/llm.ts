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
  ambition_score: number;
  usefulness_score: number;
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
  "novelty_score": 1-10 (How new or unique is this idea? 1-2: Clone of existing product, nothing new. 3-4: Minor twist on well-known concept. 5-6: Interesting combination or fresh angle. 7-8: Genuinely novel approach, rarely seen before. 9-10: Paradigm-shifting, truly unprecedented),
  "ambition_score": 1-10 (Technical depth and scope? 1-2: Simple wrapper or tutorial-level. 3-4: Standard CRUD or single-feature tool. 5-6: Solid engineering, multiple components. 7-8: Complex system, significant technical challenges solved. 9-10: Cutting-edge research or massive infrastructure),
  "usefulness_score": 1-10 (Impact for target audience? 1-2: Solves a non-problem or toy use case. 3-4: Marginal improvement over existing solutions. 5-6: Genuinely useful for a niche audience. 7-8: Broadly useful, clear pain point addressed. 9-10: Essential tool, large audience desperately needs this),
  "pick_reason": "One sentence explaining what makes this project noteworthy, or 'Nothing stands out' if generic",
  "tags": ["3-5 descriptive tags beyond the category"]
}

IMPORTANT: Be harsh with scores. Most projects should score 3-5 on each dimension. Reserve 7+ for truly exceptional work. Do NOT inflate scores.
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
 * Compute a 0-100 composite pick score from the three AI sub-scores.
 * Novelty weighted highest — AI picks should surface things the crowd might miss.
 */
export function computePickScore(novelty: number, usefulness: number, ambition: number): number {
  return Math.round((novelty * 0.45 + usefulness * 0.30 + ambition * 0.25) * 10);
}

function parseResult(raw: string): AnalysisResult {
  // Strip markdown fencing if present
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);

  const novelty_score = clamp(Number(parsed.novelty_score) || 3, 1, 10);
  const ambition_score = clamp(Number(parsed.ambition_score) || 3, 1, 10);
  const usefulness_score = clamp(Number(parsed.usefulness_score) || 3, 1, 10);

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
