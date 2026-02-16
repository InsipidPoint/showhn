# HN Showcase

An AI-powered visual gallery for [Show HN](https://news.ycombinator.com/showhn.html) projects. Browse, filter, and discover the best projects launched on Hacker News — with automated screenshots, AI analysis, and full-text search.

**Live:** [hnshowcase.com](https://hnshowcase.com)

## Features

- **Visual gallery** — Automated screenshots of every Show HN project
- **AI analysis** — Each project gets a summary, category, tech stack, vibe score, and interest score via LLM
- **Full-text search** — SQLite FTS5 search across titles and AI summaries
- **Daily digest** — Curated view of each day's best projects
- **Filtering** — By time range, category, points, comments, or AI interest score
- **Dark mode** — System-aware with manual toggle
- **Fast** — Server-rendered with SQLite, no external database dependencies

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/ui
- **Database:** SQLite + Drizzle ORM + FTS5 for search
- **AI:** Configurable LLM pipeline (OpenAI or Anthropic)
- **Screenshots:** Playwright (headless Chromium)
- **Data:** Algolia HN Search API for ingestion

## Getting Started

### Prerequisites

- Node.js 20+
- A Chromium-compatible environment (for screenshots)
- An OpenAI or Anthropic API key (for AI analysis)

### Setup

```bash
cd app
npm install

# Copy environment config
cp .env.example .env.local
# Edit .env.local with your API keys

# Run database migrations
npx drizzle-kit push

# Ingest Show HN posts from Algolia
npx tsx scripts/ingest.ts --backfill

# Set up full-text search
npx tsx scripts/setup-fts.ts

# Take screenshots (optional, needs Playwright browsers)
npx playwright install chromium
npx tsx scripts/screenshot.ts --limit 50

# Run AI analysis (optional, needs API key)
npx tsx scripts/analyze.ts --limit 50

# Start dev server
npm run dev
```

The app runs on port 3000 by default. Override with `PORT=3333 npm run dev`.

### Scripts

| Script | Description |
|--------|-------------|
| `scripts/ingest.ts` | Fetch Show HN posts from Algolia. Use `--backfill` for 30-day lookback. |
| `scripts/screenshot.ts` | Capture screenshots via Playwright. Use `--limit N` to control batch size. |
| `scripts/analyze.ts` | Run LLM analysis on posts. Use `--limit N` to control batch size. |
| `scripts/setup-fts.ts` | Rebuild the FTS5 search index. Run after ingestion. |

### Environment Variables

See [`.env.example`](app/.env.example) for all available options:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/showhn.db` | Path to SQLite database |
| `ANALYSIS_PROVIDER` | `openai` | LLM provider (`openai` or `anthropic`) |
| `ANALYSIS_MODEL` | `gpt-4o-mini` | Model name for analysis |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `SCREENSHOT_CONCURRENCY` | `4` | Parallel browser instances |
| `SCREENSHOT_TIMEOUT` | `15000` | Screenshot timeout in ms |

## Production Deployment

```bash
cd app
npm run build
PORT=3333 npm start
```

Use a reverse proxy (Caddy, nginx) in front for HTTPS. See [`deploy/`](deploy/) for example configs.

## Project Structure

```
app/
  src/
    app/              # Next.js pages (homepage, search, digest, post detail)
    components/       # React components (header, post card, filter bar, etc.)
    lib/
      db/             # Database schema, queries, connection
      ai/             # LLM analysis pipeline
      sanitize.ts     # HTML sanitization
  scripts/            # Data pipeline scripts
  data/               # SQLite database (gitignored)
  public/screenshots/ # Project screenshots (gitignored)
legacy/               # Original 2012 Python project (preserved for history)
```

## History

This project started in 2012 as a Python/Pyramid web app backed by MongoDB, originally built to showcase Show HN projects with basic screenshot thumbnails and social sharing buttons (Twitter, Facebook, Tumblr, Google+). The original source lives in [`legacy/`](legacy/).

In 2026 it was rebuilt from the ground up as a modern Next.js application with AI-powered analysis, automated screenshot pipelines, and full-text search — while keeping the same spirit of making Show HN projects more discoverable.

## License

MIT
