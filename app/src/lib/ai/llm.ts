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

export const TIER_DOTS: Record<Tier, string> = {
  gem: "●●●●",
  banger: "●●●",
  solid: "●●",
  mid: "●",
  pass: "○",
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

/** Semantic colors for each vibe tag — light + dark mode bg/text/border classes */
export const VIBE_TAG_COLORS: Record<string, string> = {
  "Wizardry":         "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700",
  "Eye Candy":        "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700",
  "Big Brain":        "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  "Crowd Pleaser":    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
  "Niche Gem":        "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
  "Bold Bet":         "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
  "Ship It":          "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700",
  "Zero to One":      "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700",
  "Cozy":             "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700",
  "Slick":            "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700",
  "Solve My Problem": "bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-900/40 dark:text-lime-300 dark:border-lime-700",
  "Rabbit Hole":      "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700",
  "Dark Horse":       "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-600",
};

const VIBE_TAG_FALLBACK = "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:border-zinc-700";

export function getVibeTagColor(tag: string): string {
  return VIBE_TAG_COLORS[tag] || VIBE_TAG_FALLBACK;
}

export type AnalysisResult = {
  summary: string;
  category: string;
  target_audience: string;
  tier: Tier;
  vibe_tags: string[];
  highlight: string;
  strengths: string[];
  weaknesses: string[];
  similar_to: string[];
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
  "summary": "One sentence for link previews: what this project does, plain and specific (no opinions)",
  "category": "One of: ${CATEGORIES.join(", ")}",
  "target_audience": "Who would use this (e.g. 'Backend developers', 'Small business owners')",
  "tier": "gem | banger | solid | mid | pass",
  "vibe_tags": ["1-3 tags from the allowed list below"],
  "highlight": "One sentence that makes someone click or skip. Lead with what's interesting or what's not. Specific and opinionated. Max 25 words.",
  "strengths": ["1-3 bullets, ~12 words each: what's genuinely clever, useful, or well-built"],
  "weaknesses": ["1-2 bullets, ~12 words each: what's missing, limiting, or already solved elsewhere"],
  "similar_to": ["1-3 existing tools or products this competes with or closely resembles. Empty array if truly novel."]
}

TIER GUIDE — read all five before deciding. When in doubt, go lower.
  gem:    The best of Show HN — you'd send this link to a friend unprompted. Novel concept
          or approach, strong execution, and genuine "wow" factor. This is rare (roughly
          1 in 30-40 projects) but it should actually get used when something is clearly
          a cut above banger. If a project makes you think "this is special," trust that.
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

TIER REFERENCE EXAMPLES — use these to calibrate your judgment:
  gem:    A real-time collaborative code editor that works entirely in the browser with
          CRDTs, built-in terminal, and sub-50ms sync. Novel architecture, impressive
          engineering depth, and immediately useful to a wide audience = gem.
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

HIGHLIGHT — one sentence (~25 words max) that hooks or dismisses.
  Strengths/weaknesses carry the detail — the highlight just makes someone click or skip.
  Rules:
  - NEVER start with "A [adjective] [noun] that..."
  - Be specific: name a feature, technique, or competitor.
  - Have a point of view.
  - For mid/pass: be direct about why.
  Voice: sharp, opinionated, like a senior dev texting a friend.
  BANNED phrases: "polished", "well-executed", "addresses a clear need", "fills a real gap",
  "production-ready", "developer-focused", "seamlessly", "thoughtful", "leverages".
  Good: "Pixel-accurate Win98 nostalgia that somehow runs real sites inside it."
  Good: "HTML-to-Markdown for LLMs when JinaAI and Firecrawl already exist."
  Good: "Nine layers of architecture for a local memory tool — the README outpaces the code."
  Bad: "A polished, developer-focused tool that addresses a clear gap in the ecosystem."

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

  return {
    summary: String(parsed.summary || ""),
    category: CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
    target_audience: String(parsed.target_audience || ""),
    tier,
    vibe_tags,
    highlight,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
    similar_to: Array.isArray(parsed.similar_to) ? parsed.similar_to.map(String).slice(0, 3) : [],
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
