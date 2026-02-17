import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import Link from "next/link";
import type { Post, AiAnalysis } from "@/lib/db/schema";
import { TIER_LABELS, type Tier } from "@/lib/ai/llm";

// Tier styling — each tier gets a distinct color personality
const tierStyles: Record<string, { badge: string; border: string; text: string }> = {
  gem: {
    badge: "bg-violet-500/90 text-white dark:bg-violet-400/90 dark:text-violet-950",
    border: "border-violet-400/60 dark:border-violet-400/60",
    text: "text-violet-600 dark:text-violet-400",
  },
  banger: {
    badge: "bg-amber-500/90 text-white dark:bg-amber-400/90 dark:text-amber-950",
    border: "border-amber-400/60 dark:border-amber-400/60",
    text: "text-amber-600 dark:text-amber-400",
  },
  solid: {
    badge: "bg-emerald-500/90 text-white dark:bg-emerald-400/90 dark:text-emerald-950",
    border: "border-emerald-400/60 dark:border-emerald-400/60",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  mid: {
    badge: "bg-zinc-400/90 text-white dark:bg-zinc-500/90 dark:text-zinc-200",
    border: "border-zinc-400/60 dark:border-zinc-500/60",
    text: "text-zinc-500 dark:text-zinc-400",
  },
  pass: {
    badge: "bg-zinc-300/90 text-zinc-600 dark:bg-zinc-600/90 dark:text-zinc-300",
    border: "border-zinc-300/60 dark:border-zinc-600/60",
    text: "text-zinc-400 dark:text-zinc-500",
  },
};

const defaultTierStyle = tierStyles.mid;

function getTierStyle(tier: string | null | undefined) {
  return tierStyles[tier || ""] || defaultTierStyle;
}

// Vibe tag colors — rotate through a set of fun muted colors
const vibeTagColors = [
  "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
];

function vibeTagColor(tag: string): string {
  // Deterministic color based on tag content
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  return vibeTagColors[Math.abs(hash) % vibeTagColors.length];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/^show hn:\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function PostCard({
  post,
  analysis,
}: {
  post: Post;
  analysis?: AiAnalysis | null;
}) {
  const slug = slugify(post.title);
  const href = `/post/${post.id}/${slug}`;
  const displayTitle = post.title.replace(/^Show HN:\s*/i, "");

  const tier = analysis?.tier as Tier | null;
  const tierStyle = getTierStyle(tier);
  const vibeTags: string[] = analysis?.vibeTags ? JSON.parse(analysis.vibeTags) : [];
  // Use highlight (pickReason) as the primary text, fall back to summary
  const highlight = analysis?.pickReason && analysis.pickReason !== "Nothing stands out"
    ? analysis.pickReason
    : analysis?.summary || null;

  return (
    <Link href={href} className="group block">
      <article className="rounded-lg border border-border bg-card overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5 dark:shadow-none dark:hover:shadow-md dark:hover:shadow-primary/5 dark:hover:border-primary/20">
        {/* Screenshot */}
        <div className="relative aspect-[16/10] bg-muted overflow-hidden">
          {post.hasScreenshot ? (
            <Image
              src={`/screenshots/${post.id}.webp`}
              alt={displayTitle}
              fill
              className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/60">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              <span className="text-[11px] mt-1.5">
                {post.status === "no_url" ? "Text post" : "Capturing..."}
              </span>
            </div>
          )}
          {analysis?.category && (
            <div className="absolute top-2 left-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-background/85 backdrop-blur-sm border border-border/50 shadow-sm">
                {analysis.category}
              </Badge>
            </div>
          )}
          {tier && tier !== "mid" && tier !== "pass" && (
            <div className="absolute top-2 right-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase shadow-sm backdrop-blur-sm ${tierStyle.badge}`}>
                {TIER_LABELS[tier]}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-3">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 mb-1 group-hover:text-primary transition-colors">
            {displayTitle}
          </h3>

          {/* Highlight — the star of the show */}
          {highlight ? (
            <p className="text-xs text-muted-foreground line-clamp-3 mb-2.5 leading-relaxed">
              {highlight}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground line-clamp-3 mb-2.5 leading-relaxed">
              {post.storyText
                ? post.storyText.replace(/<[^>]*>/g, "").slice(0, 160)
                : "\u00A0"}
            </p>
          )}

          {/* Vibe tags */}
          {vibeTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2.5">
              {vibeTags.map((tag) => (
                <span
                  key={tag}
                  className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium ${vibeTagColor(tag)}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-medium truncate mr-2">{post.author}</span>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="inline-flex items-center gap-0.5 text-primary/70">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                {post.points}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                {post.comments}
              </span>
              <span>{timeAgo(post.createdAt)}</span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="aspect-[16/10] bg-muted animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-3 bg-muted rounded animate-pulse w-full" />
        <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
        <div className="h-3 bg-muted rounded animate-pulse w-40 pt-1" />
        <div className="flex justify-between pt-1">
          <div className="h-3 bg-muted rounded animate-pulse w-16" />
          <div className="h-3 bg-muted rounded animate-pulse w-24" />
        </div>
      </div>
    </div>
  );
}
