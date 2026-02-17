import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "The story behind HN Showcase — from a 2011 weekend hack to an AI-powered visual gallery for Show HN.",
  alternates: { canonical: "https://hnshowcase.com/about" },
  openGraph: {
    title: "About — HN Showcase",
    description:
      "The story behind HN Showcase — from a 2011 weekend hack to an AI-powered visual gallery for Show HN.",
    url: "https://hnshowcase.com/about",
    images: [{ url: "https://hnshowcase.com/og-image.png", width: 1200, height: 630 }],
  },
};

export default function AboutPage() {
  return (
    <article className="max-w-2xl mx-auto space-y-12 py-4">
      {/* Hero */}
      <header className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          About HN Showcase
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          A visual gallery for Show HN projects — originally built as a weekend
          hack in 2011, rebuilt in 2026 with AI scoring, screenshots, and a lot
          of vibe coding.
        </p>
      </header>

      {/* Origin */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          The Original (2011–2012)
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          HN Showcase started as a weekend project by{" "}
          <a
            href="https://news.ycombinator.com/user?id=ssong"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            ssong
          </a>{" "}
          and{" "}
          <a
            href="https://news.ycombinator.com/user?id=nnythm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            nnythm
          </a>{" "}
          in{" "}
          <a
            href="https://news.ycombinator.com/item?id=2843490"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            August 2011
          </a>. The idea was simple: Show HN posts are some of the
          best parts of Hacker News, but there was no good way to browse them
          visually. We built a thumbnail gallery using the HN Search API,
          Pyramid, jQuery, and url2png.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          The{" "}
          <a
            href="https://news.ycombinator.com/item?id=4053755"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            community picked it up
          </a>{" "}
          (158 points). In 2012 I shipped a{" "}
          <a
            href="https://news.ycombinator.com/item?id=4533254"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            v2 with infinite scrolling, search, and a polished design
          </a>
          . Then, as side projects do, it eventually went offline — the domain
          lapsed, the dotCloud hosting shut down, and life moved on.
        </p>
      </section>

      {/* Why Now */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Why Rebuild Now?
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          Show HN has changed dramatically. In 2011, you&apos;d see a handful of
          posts per day. Now there are 50–100+ daily, driven largely by the
          explosion of AI-powered tools, vibe-coded side projects, and a new
          wave of builders shipping faster than ever. The volume makes it harder
          to find the genuinely interesting stuff.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          I thought: what if I brought HN Showcase back, but built for this
          era? Visual browsing, AI as a judge to surface the most
          interesting projects, and a daily digest so you never miss the good
          ones.
        </p>
      </section>

      {/* What's Different */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          What&apos;s New in v3
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            icon="📸"
            title="Live Screenshots"
            description="Every project gets a real screenshot captured via headless browser — no broken thumbnails."
          />
          <FeatureCard
            icon="🤖"
            title="AI Tier Ratings"
            description="AI classifies each project with a tier (Gem → Pass), playful vibe tags, and an editorial mini-review. The daily digest highlights top picks."
          />
          <FeatureCard
            icon="📰"
            title="Daily Digest"
            description="A curated summary of the best Show HN projects from the past 24 hours, updated automatically."
          />
          <FeatureCard
            icon="🔍"
            title="Full-Text Search"
            description="Search across titles, summaries, and tags to find exactly the project you're looking for."
          />
        </div>
      </section>

      {/* Vibe Coding */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Built with Vibe Coding
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          This v3 rebuild was largely vibe-coded — built collaboratively with AI
          coding assistants, iterating fast, shipping features in hours instead
          of weeks. The frontend, the scoring pipeline, the screenshot worker —
          all shaped through rapid human-AI collaboration. It felt appropriate
          for a tool that showcases AI-era projects.
        </p>
      </section>

      {/* AI Scoring */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          How AI Picks Work
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          Every Show HN post gets judged by AI — it looks at the project&apos;s
          description, tech stack, and a screenshot of the landing page to
          classify each project into a tier and write a short editorial take.
        </p>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Tiers</h3>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">Gem</span>
              <span>Exceptional — you&apos;d mass-share this link. (~5% of projects)</span>
            </li>
            <li className="flex gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Banger</span>
              <span>Really compelling, clear &quot;oh that&apos;s cool&quot; moment. (~15%)</span>
            </li>
            <li className="flex gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">Solid</span>
              <span>Good work, interesting to its niche. (~40%)</span>
            </li>
            <li className="flex gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Mid</span>
              <span>Nothing special stands out. (~30%)</span>
            </li>
            <li className="flex gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-50 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">Pass</span>
              <span>Generic, broken, or no substance. (~10%)</span>
            </li>
          </ul>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Vibe Tags</h3>
          <p className="text-muted-foreground leading-relaxed">
            Each project also gets 1–3 playful vibe tags that describe
            <em> what kind</em> of interesting it is — things like
            &quot;Rabbit Hole,&quot; &quot;Eye Candy,&quot; &quot;Wizardry,&quot;
            &quot;Dark Horse,&quot; or &quot;Solve My Problem.&quot;
          </p>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          The star of each card is the AI&apos;s editorial highlight — a 2–3 sentence
          mini-review that tells you what&apos;s actually interesting (or honestly,
          what isn&apos;t). No generic praise, no empty scores — just a quick take
          you can scan and decide if it&apos;s worth clicking.
        </p>
      </section>

      {/* Open Source */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Open Source</h2>
        <p className="text-muted-foreground leading-relaxed">
          HN Showcase is open source, as it always has been.
        </p>
        <a
          href="https://github.com/InsipidPoint/showhn"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          View on GitHub
        </a>
      </section>

      {/* Credits */}
      <section className="space-y-4 pb-8">
        <h2 className="text-xl font-semibold tracking-tight">Credits</h2>
        <p className="text-muted-foreground leading-relaxed">
          Built by{" "}
          <a
            href="https://news.ycombinator.com/user?id=ssong"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            ssong
          </a>
          . v1 co-created with{" "}
          <a
            href="https://news.ycombinator.com/user?id=nnythm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            nnythm
          </a>
          . Data via the{" "}
          <a
            href="https://hn.algolia.com/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Algolia HN Search API
          </a>
          . Not affiliated with Y Combinator.
        </p>
      </section>
    </article>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
