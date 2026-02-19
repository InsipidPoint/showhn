/**
 * Backfill page_content and readme_content for existing posts.
 * Fetches in parallel — no LLM calls, just HTTP requests.
 *
 * Usage:
 *   npx tsx scripts/backfill-content.ts              # backfill all missing
 *   npx tsx scripts/backfill-content.ts --concurrency 50
 *   npx tsx scripts/backfill-content.ts --dry-run     # just count what's missing
 */

import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "showhn.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const concurrencyIdx = args.indexOf("--concurrency");
const CONCURRENCY = concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : 30;

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchPageContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HNShowcase/1.0; +https://hnshowcase.com)",
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

function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function fetchGitHubReadme(owner: string, repo: string): Promise<string> {
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

// ─── Parallel runner ─────────────────────────────────────────────────────────

async function runParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Posts missing page_content that have a URL
  const needsPage = sqlite
    .prepare(`SELECT id, url FROM posts WHERE url IS NOT NULL AND (page_content IS NULL OR page_content = '') AND status = 'active'`)
    .all() as { id: number; url: string }[];

  // Posts missing readme_content that have a GitHub URL
  const needsReadme = sqlite
    .prepare(`SELECT id, url FROM posts WHERE url LIKE 'https://github.com/%' AND (readme_content IS NULL OR readme_content = '') AND status = 'active'`)
    .all() as { id: number; url: string }[];

  console.log(`[backfill] ${needsPage.length} posts missing page_content`);
  console.log(`[backfill] ${needsReadme.length} posts missing readme_content`);
  console.log(`[backfill] Concurrency: ${CONCURRENCY}`);

  if (dryRun) {
    console.log("[backfill] Dry run — exiting.");
    return;
  }

  // Backfill page content
  if (needsPage.length > 0) {
    console.log(`\n[backfill] Fetching page content...`);
    const updateStmt = sqlite.prepare(`UPDATE posts SET page_content = ? WHERE id = ?`);
    let filled = 0;
    let failed = 0;

    await runParallel(needsPage, CONCURRENCY, async (post) => {
      const content = await fetchPageContent(post.url);
      if (content) {
        updateStmt.run(content, post.id);
        filled++;
      } else {
        failed++;
      }
      const total = filled + failed;
      if (total % 100 === 0) {
        console.log(`  [page] ${total}/${needsPage.length} (${filled} filled, ${failed} empty)`);
      }
    });

    console.log(`[backfill] Page content done: ${filled} filled, ${failed} empty`);
  }

  // Backfill READMEs
  if (needsReadme.length > 0) {
    console.log(`\n[backfill] Fetching GitHub READMEs...`);
    const updateStmt = sqlite.prepare(`UPDATE posts SET readme_content = ? WHERE id = ?`);
    let filled = 0;
    let failed = 0;

    await runParallel(needsReadme, CONCURRENCY, async (post) => {
      const ghRepo = parseGitHubRepo(post.url);
      if (!ghRepo) { failed++; return; }
      const content = await fetchGitHubReadme(ghRepo.owner, ghRepo.repo);
      if (content) {
        updateStmt.run(content, post.id);
        filled++;
      } else {
        failed++;
      }
      const total = filled + failed;
      if (total % 50 === 0) {
        console.log(`  [readme] ${total}/${needsReadme.length} (${filled} filled, ${failed} empty)`);
      }
    });

    console.log(`[backfill] READMEs done: ${filled} filled, ${failed} empty`);
  }

  // Final stats
  const stats = sqlite.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN page_content IS NOT NULL AND page_content != '' THEN 1 ELSE 0 END) as has_page,
      SUM(CASE WHEN readme_content IS NOT NULL AND readme_content != '' THEN 1 ELSE 0 END) as has_readme
    FROM posts
  `).get() as { total: number; has_page: number; has_readme: number };

  console.log(`\n[backfill] Final: ${stats.has_page}/${stats.total} have page content, ${stats.has_readme}/${stats.total} have READMEs`);
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
