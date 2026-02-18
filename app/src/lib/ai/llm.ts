/**
 * Configurable LLM client — supports OpenAI and Anthropic.
 * Controlled via ANALYSIS_PROVIDER and ANALYSIS_MODEL env vars.
 *
 * Rating system: tier classification + playful vibe tags + editorial highlight.
 * No numeric sub-scores shown to users — the written highlight is the star.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const TIERS = ["gem", "banger", "solid", "mid", "pass"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  gem: "Gem",
  banger: "Banger",
  solid: "Solid",
  mid: "Mid",
  pass: "Pass",
};

/** Fixed pick_score per tier — used for DB sorting only */
const TIER_SCORES: Record<Tier, number> = {
  gem: 95,
  banger: 80,
  solid: 65,
  mid: 50,
  pass: 35,
};

export const VIBE_TAGS = [
  "Rabbit Hole",
  "Dark Horse",
  "Eye Candy",
  "Wizardry",
  "Big Brain",
  "Crowd Pleaser",
  "Niche Gem",
  "Bold Bet",
  "Ship It",
  "Zero to One",
  "Cozy",
  "Slick",
  "Solve My Problem",
] as const;

export type VibeTag = (typeof VIBE_TAGS)[number];

export type AnalysisResult = {
  summary: string;
  category: string;
  tech_stack: string[];
  target_audience: string;
  tier: Tier;
  vibe_tags: string[];
  highlight: string;
  tags: string[];
  // Legacy fields — kept for backward compat / DB columns
  vibe_score: number;
  interest_score: number;
  novelty_score: number;
  ambition_score: number;
  usefulness_score: number;
  pick_reason: string;
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

function buildPrompt(title: string, url: string | null, pageContent: string, storyText: string | null, readmeContent?: string, hasScreenshot?: boolean): string {
  return `You're a sharp, opinionated tech writer reviewing Show HN projects. Analyze this project and return a JSON object.
${hasScreenshot ? "\nA screenshot of the project's landing page is attached. Use it to assess design and UI quality — but don't let visual polish inflate the tier. A clean landing page is table stakes, not a differentiator. Most SaaS products look decent now. Only upgrade a tier for design if the visuals are genuinely striking or the UX reveals real craft. A pretty page on a derivative idea is still mid.\n" : ""}
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
  "tech_stack": ["detected technologies, frameworks, languages"],
  "target_audience": "Who would use this (e.g. 'Backend developers', 'Small business owners')",
  "tier": "gem | banger | solid | mid | pass",
  "vibe_tags": ["1-3 tags from the allowed list below"],
  "highlight": "2-3 sentences: your editorial take on this project. What's interesting, what's clever, what's the vibe? Write like you're telling a friend about it. Be specific — mention actual features or techniques, not generic praise.",
  "tags": ["3-5 descriptive tags beyond the category"]
}

TIER GUIDE — read all five before deciding. When in doubt, go lower.
  gem:    You'd text this link to a friend right now. Requires genuinely novel idea AND
          impressive execution AND broad appeal — all three together. If you're debating
          between gem and banger, it's a banger.
  banger: Clear "oh that's cool" moment that most developers would appreciate. Needs both
          an interesting idea AND strong execution — not either/or. The project must do
          something that isn't already well-served by established tools in the space.
          If you're debating between banger and solid, it's a solid.
  solid:  Competent project that does what it says. Interesting to its niche, reasonable
          execution. You'd use it if you had the problem but wouldn't go out of your way
          to tell someone about it.
  mid:    Works but doesn't stand out. Applies to: derivative idea where a well-known tool
          already does this, unremarkable execution, crowded category with no clear
          differentiation, or an embryonic product competing against established tools.
          A README full of buzzwords without matching implementation quality belongs here.
  pass:   No substance. Generic, broken, tutorial-level clone, empty landing page, blog
          post masquerading as a product, or a feature count without real depth (e.g. "100+
          tools" that each wrap a library function).

TIER REFERENCE EXAMPLES — use these to calibrate your judgment:
  gem:    "Windows 98½" — pixel-accurate retro desktop that runs real sites. Novel concept,
          masterful CSS craft, instant viral appeal. All three together = gem.
  banger: "HiddenState" — ML news filter using cross-source convergence scoring. Clever
          methodology, real value, but ultimately still a newsletter/digest. Cool idea +
          good execution but not "stop what you're doing and look at this" = banger.
  solid:  "ContextLedger" — CLI for handing off context between AI coding sessions. Real
          problem, decent engineering, but no "oh cool" moment. Competent and useful to
          its niche = solid.
  mid:    "Klovr" — HTML-to-Markdown converter for LLMs. JinaAI, Firecrawl, and Pandoc
          already do this well. Competent but the category is commoditized = mid.
  pass:   "Free Browser Dev Tools" — JSON formatter, base64 encoder, JWT decoder on a
          GitHub Pages site. Works fine but CyberChef and 100 identical sites exist.
          Nothing here worth curating = pass.

VIBE TAGS — pick 1-3 that genuinely fit from this list (don't force them):
  "Rabbit Hole"      — You'll lose hours exploring this
  "Dark Horse"       — Surprisingly good, flies under the radar
  "Eye Candy"        — Beautiful design or visual experience
  "Wizardry"         — Impressive technical feat, "how did they do that?"
  "Big Brain"        — Clever, non-obvious approach to the problem
  "Crowd Pleaser"    — Broad appeal, everyone will want to try it
  "Niche Gem"        — Perfect for its specific audience
  "Bold Bet"         — Ambitious swing, respect the attempt
  "Ship It"          — MVP energy, early but promising
  "Zero to One"      — Genuinely new thing, didn't exist before
  "Cozy"             — Small, delightful, well-crafted
  "Slick"            — Polished, feels like a real product
  "Solve My Problem" — Immediately useful, fills a real gap

HIGHLIGHT GUIDE — this is the most important field. Make it worth reading.
  Rules:
  - NEVER start with "A [adjective] [noun] that..." — this sentence formula is banned.
  - Vary your sentence structure. Mix short punchy sentences with longer ones.
  - Be specific: name actual features, techniques, or design choices.
  - Have a point of view. Say what's clever, what's missing, what surprised you.
  - For mid/pass: be honest and direct about why it doesn't stand out.
  - 2-3 sentences max. Every word should earn its place.
  Voice: sharp, opinionated, curious. Like a senior dev who's seen a lot and gets genuinely
  excited when something is actually good — and isn't polite about the rest.
  BANNED phrases (never use these): "polished", "well-executed", "addresses a clear need",
  "fills a real gap", "production-ready", "developer-focused", "seamlessly", "thoughtful",
  "leverages", "bridges the gap".
  Good: "Someone spent real time on the CSS — the scrollbar arrows are SVGs, the window
  chrome has proper inset/outset borders, the startup splash has a working progress bar.
  Pixel-accurate 1998 nostalgia that somehow runs real sites inside it."
  Good: "HTML-to-Markdown for LLMs is a solved problem — JinaAI, Firecrawl, and Pandoc
  all do this. The CSS selector rules for site-specific extraction are a nice touch, but
  this needs a stronger reason to exist than a faster P99."
  Good: "Nine layers of architecture including Bayesian preference learning and LightGBM
  ranking — for a local memory tool. The README is more confident than the implementation
  evidence justifies."
  Bad: "A polished, developer-focused tool that addresses a clear gap in the ecosystem."
  (banned words, formula sentence, says nothing specific)

Don't penalize good enterprise/infra projects — a well-built database tool solving real
pain is a banger even if it's not "fun."

Be concise. Return ONLY valid JSON, no markdown fencing.`;
}

async function callOpenAI(prompt: string, model: string, screenshotBase64?: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Build message content — text-only or text+image
  const content: OpenAI.ChatCompletionContentPart[] = [];
  if (screenshotBase64) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/webp;base64,${screenshotBase64}`, detail: "auto" },
    });
  }
  content.push({ type: "text", text: prompt });

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content }],
    max_completion_tokens: 4000,
    response_format: { type: "json_object" },
  });
  return response.choices[0]?.message?.content || "";
}

async function callAnthropic(prompt: string, model: string, screenshotBase64?: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const content: Anthropic.ContentBlockParam[] = [];
  if (screenshotBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/webp", data: screenshotBase64 },
    });
  }
  content.push({ type: "text", text: prompt });

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: "user", content }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Convert tier to numeric pick_score for DB sorting */
export function tierToPickScore(tier: Tier): number {
  return TIER_SCORES[tier] ?? 50;
}

export function parseTier(value: unknown): Tier {
  const s = String(value || "").toLowerCase().trim();
  if (TIERS.includes(s as Tier)) return s as Tier;
  return "mid";
}

export function parseVibeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const validTags = new Set<string>(VIBE_TAGS as unknown as string[]);
  return value
    .map(String)
    .filter((t) => validTags.has(t))
    .slice(0, 3);
}

function parseResult(raw: string): AnalysisResult {
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);

  const tier = parseTier(parsed.tier);
  const vibe_tags = parseVibeTags(parsed.vibe_tags);
  const highlight = String(parsed.highlight || parsed.pick_reason || "");

  // Legacy sub-scores — derive from tier for backward compat
  const tierScoreMap: Record<Tier, number> = { gem: 9, banger: 7, solid: 5, mid: 3, pass: 2 };
  const defaultSubScore = tierScoreMap[tier];
  const novelty_score = clamp(Number(parsed.novelty_score) || defaultSubScore, 1, 10);
  const ambition_score = clamp(Number(parsed.craft_score ?? parsed.ambition_score) || defaultSubScore, 1, 10);
  const usefulness_score = clamp(Number(parsed.appeal_score ?? parsed.usefulness_score) || defaultSubScore, 1, 10);
  const avgScore = (novelty_score + ambition_score + usefulness_score) / 3;
  const interest_score = clamp(Math.round(avgScore / 2), 1, 5);

  return {
    summary: String(parsed.summary || ""),
    category: CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
    tech_stack: Array.isArray(parsed.tech_stack) ? parsed.tech_stack.map(String) : [],
    target_audience: String(parsed.target_audience || ""),
    tier,
    vibe_tags,
    highlight,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 5) : [],
    // Legacy
    vibe_score: clamp(Number(parsed.vibe_score) || 3, 1, 5),
    interest_score,
    novelty_score,
    ambition_score,
    usefulness_score,
    pick_reason: highlight,
  };
}

export async function analyzePost(
  title: string,
  url: string | null,
  pageContent: string,
  storyText: string | null,
  readmeContent?: string,
  screenshotBase64?: string
): Promise<{ result: AnalysisResult; model: string }> {
  const provider = process.env.ANALYSIS_PROVIDER || "openai";
  const model = process.env.ANALYSIS_MODEL || "gpt-5-mini";
  const prompt = buildPrompt(title, url, pageContent, storyText, readmeContent, !!screenshotBase64);

  let raw: string;
  if (provider === "anthropic") {
    raw = await callAnthropic(prompt, model, screenshotBase64);
  } else {
    raw = await callOpenAI(prompt, model, screenshotBase64);
  }

  const result = parseResult(raw);
  return { result, model };
}
