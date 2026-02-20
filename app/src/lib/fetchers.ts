/**
 * Shared content-fetching and file-loading utilities.
 * Used by worker, rescore, and backfill scripts.
 */

import fs from "fs";
import path from "path";

const SCREENSHOT_DIR = path.join(process.cwd(), "public", "screenshots");

/** Block requests to private/internal network addresses. */
function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    // Block localhost, link-local, metadata endpoints, and private IPs
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return true;
    if (hostname.startsWith("169.254.") || hostname === "metadata.google.internal") return true;
    if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
    return false;
  } catch {
    return true;
  }
}

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB max

/** Fetch a URL and extract text content from the HTML. */
export async function fetchPageContent(url: string): Promise<string> {
  try {
    if (isPrivateUrl(url)) return "";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HNShowcase/1.0; +https://hnshowcase.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return "";

    // Check content-length before reading body to avoid huge responses
    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_RESPONSE_SIZE) return "";

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
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  // Skip GitHub special pages (marketplace, explore, sponsors, etc.)
  const specialPaths = ["marketplace", "explore", "sponsors", "topics", "settings", "orgs", "features", "enterprise", "pricing"];
  if (specialPaths.includes(match[1].toLowerCase())) return null;
  const repo = match[2].replace(/\.git$/, "");
  return { owner: match[1], repo };
}

/** Fetch GitHub repo metadata (stars, language, description) via the GitHub API. */
export async function fetchGitHubMeta(
  owner: string,
  repo: string
): Promise<{ stars: number; language: string | null; description: string | null } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "HNShowcase/1.0",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();

    return {
      stars: data.stargazers_count ?? 0,
      language: data.language ?? null,
      description: data.description ?? null,
    };
  } catch {
    return null;
  }
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
