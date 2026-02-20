/**
 * Shared content-fetching and file-loading utilities.
 * Used by worker, rescore, and backfill scripts.
 */

import fs from "fs";
import path from "path";

const SCREENSHOT_DIR = path.join(process.cwd(), "public", "screenshots");

/** Fetch a URL and extract text content from the HTML. */
export async function fetchPageContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HNShowcase/1.0; +https://hnshowcase.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return "";
    const html = await res.text();

    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
  } catch {
    return "";
  }
}

/** Parse a GitHub URL into owner/repo. Returns null for non-GitHub URLs. */
export function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/** Fetch the README.md from a GitHub repo (tries main, then master branch). */
export async function fetchGitHubReadme(owner: string, repo: string): Promise<string> {
  for (const branch of ["main", "master"]) {
    try {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const text = await res.text();
        return text.slice(0, 5000);
      }
    } catch {
      // try next branch
    }
  }
  return "";
}

/** Load a screenshot from disk as base64. Returns undefined if not found. */
export function loadScreenshot(postId: number, screenshotDir?: string): string | undefined {
  const dir = screenshotDir || SCREENSHOT_DIR;
  for (const ext of ["webp", "png"]) {
    const p = path.join(dir, `${postId}_thumb.${ext}`);
    if (fs.existsSync(p)) return fs.readFileSync(p).toString("base64");
  }
  return undefined;
}
