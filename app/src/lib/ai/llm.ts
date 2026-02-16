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

function buildPrompt(title: string, url: string | null, pageContent: string, storyText: string | null): string {
  return `Analyze this Show HN project and return a JSON object.

Title: ${title}
URL: ${url || "N/A (text-only post)"}
${storyText ? `Author's description: ${storyText.replace(/<[^>]*>/g, " ").slice(0, 1000)}` : ""}

Page content (truncated):
${pageContent.slice(0, 3000)}

Return ONLY a JSON object with these fields:
{
  "summary": "One sentence: what it does and who it's for",
  "category": "One of: ${CATEGORIES.join(", ")}",
  "tech_stack": ["Array of detected technologies, frameworks, languages"],
  "target_audience": "Who would use this (e.g. 'Backend developers', 'Small business owners')",
  "vibe_score": 1-5 (1=weekend hack, 2=side project, 3=solid tool, 4=polished product, 5=serious startup),
  "interest_score": 1-5 (1=generic/common, 2=somewhat novel, 3=interesting approach, 4=very clever, 5=groundbreaking/unique),
  "tags": ["3-5 descriptive tags beyond the category"]
}

Be concise. Return ONLY valid JSON, no markdown fencing.`;
}

async function callOpenAI(prompt: string, model: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 500,
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

function parseResult(raw: string): AnalysisResult {
  // Strip markdown fencing if present
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    summary: String(parsed.summary || ""),
    category: CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
    tech_stack: Array.isArray(parsed.tech_stack) ? parsed.tech_stack.map(String) : [],
    target_audience: String(parsed.target_audience || ""),
    vibe_score: Math.min(5, Math.max(1, Math.round(Number(parsed.vibe_score) || 3))),
    interest_score: Math.min(5, Math.max(1, Math.round(Number(parsed.interest_score) || 3))),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 5) : [],
  };
}

export async function analyzePost(
  title: string,
  url: string | null,
  pageContent: string,
  storyText: string | null
): Promise<{ result: AnalysisResult; model: string }> {
  const provider = process.env.ANALYSIS_PROVIDER || "openai";
  const model = process.env.ANALYSIS_MODEL || "gpt-5-mini";
  const prompt = buildPrompt(title, url, pageContent, storyText);

  let raw: string;
  if (provider === "anthropic") {
    raw = await callAnthropic(prompt, model);
  } else {
    raw = await callOpenAI(prompt, model);
  }

  const result = parseResult(raw);
  return { result, model };
}
