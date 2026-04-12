/** URL slug → display name mapping for all categories */
export const CATEGORY_MAP: Record<string, string> = {
  "ai-ml": "AI/ML",
  "developer-tools": "Developer Tools",
  "saas": "SaaS",
  "open-source": "Open Source",
  "hardware": "Hardware",
  "design": "Design",
  "productivity": "Productivity",
  "finance": "Finance",
  "health": "Health",
  "education": "Education",
  "social": "Social",
  "gaming": "Gaming",
  "security": "Security",
  "data": "Data",
  "infrastructure": "Infrastructure",
  "other": "Other",
};

/** Display name → URL slug */
const SLUG_MAP = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([slug, name]) => [name, slug])
);

/** Convert a category display name to its URL slug */
export function categoryToSlug(name: string): string {
  return SLUG_MAP[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
