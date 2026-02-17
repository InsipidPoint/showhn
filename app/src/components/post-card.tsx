import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import Link from "next/link";
import type { Post, AiAnalysis } from "@/lib/db/schema";

function scoreColor(ratio: number): string {
  if (ratio <= 0.2) return "bg-red-400 dark:bg-red-500";
  if (ratio <= 0.4) return "bg-orange-400 dark:bg-orange-500";
  if (ratio <= 0.6) return "bg-yellow-400 dark:bg-yellow-500";
  if (ratio <= 0.8) return "bg-emerald-400 dark:bg-emerald-500";
  return "bg-green-500 dark:bg-green-400";
}

function scoreBorderColor(ratio: number): string {
  if (ratio <= 0.2) return "border-red-400/60 dark:border-red-500/60";
  if (ratio <= 0.4) return "border-orange-400/60 dark:border-orange-500/60";
  if (ratio <= 0.6) return "border-yellow-400/60 dark:border-yellow-500/60";
  if (ratio <= 0.8) return "border-emerald-400/60 dark:border-emerald-500/60";
  return "border-green-500/60 dark:border-green-400/60";
}

function scoreTextColor(ratio: number): string {
  if (ratio <= 0.2) return "text-red-600 dark:text-red-400";
  if (ratio <= 0.4) return "text-orange-600 dark:text-orange-400";
  if (ratio <= 0.6) return "text-yellow-600 dark:text-yellow-400";
  if (ratio <= 0.8) return "text-emerald-600 dark:text-emerald-400";
  return "text-green-600 dark:text-green-400";
}

// Pick score colors — calibrated for 50-100 range where most scores land 65-85
function pickBorderColor(score: number): string {
  if (score < 65) return "border-orange-400/60 dark:border-orange-500/60";
  if (score < 72) return "border-yellow-400/60 dark:border-yellow-500/60";
  if (score < 80) return "border-emerald-400/60 dark:border-emerald-500/60";
  return "border-green-500/60 dark:border-green-400/60";
}

function pickTextColor(score: number): string {
  if (score < 65) return "text-orange-600 dark:text-orange-400";
  if (score < 72) return "text-yellow-600 dark:text-yellow-400";
  if (score < 80) return "text-emerald-600 dark:text-emerald-400";
  return "text-green-600 dark:text-green-400";
}

function MiniScoreBar({ score, max, label }: { score: number; max: number; label: string }) {
  const ratio = score / max;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] text-muted-foreground/70 w-[32px] shrink-0 truncate">{label}</span>
      <div className="flex gap-[1.5px]">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={`w-[5px] h-[5px] rounded-[1px] ${
              i < score ? scoreColor(ratio) : "bg-muted-foreground/15"
            }`}
          />
        ))}
      </div>
    </div>
  );
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
          {analysis?.pickScore != null && (
            <div className="absolute top-2 right-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-background/85 backdrop-blur-sm border-2 shadow-sm ${pickBorderColor(analysis.pickScore)}`}>
                <span className={`text-[10px] font-bold leading-none ${pickTextColor(analysis.pickScore)}`}>
                  {analysis.pickScore}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-3">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 mb-1 group-hover:text-primary transition-colors">
            {displayTitle}
          </h3>

          {analysis?.pickReason && analysis.pickReason !== "Nothing stands out" && (analysis.pickScore ?? 0) >= 50 ? (
            <p className="text-xs text-muted-foreground line-clamp-3 mb-2.5 leading-relaxed italic">
              {analysis.pickReason}
            </p>
          ) : analysis?.summary ? (
            <p className="text-xs text-muted-foreground line-clamp-3 mb-2.5 leading-relaxed">
              {analysis.summary}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground line-clamp-3 mb-2.5 leading-relaxed">
              {post.storyText
                ? post.storyText.replace(/<[^>]*>/g, "").slice(0, 160)
                : "\u00A0"}
            </p>
          )}

          {(analysis?.noveltyScore || analysis?.ambitionScore || analysis?.usefulnessScore) && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mb-2">
              {analysis.noveltyScore != null && analysis.noveltyScore > 0 && (
                <MiniScoreBar score={analysis.noveltyScore} max={10} label="New" />
              )}
              {analysis.ambitionScore != null && analysis.ambitionScore > 0 && (
                <MiniScoreBar score={analysis.ambitionScore} max={10} label="Craft" />
              )}
              {analysis.usefulnessScore != null && analysis.usefulnessScore > 0 && (
                <MiniScoreBar score={analysis.usefulnessScore} max={10} label="Wow" />
              )}
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
        <div className="space-y-1 pt-1">
          <div className="h-[5px] bg-muted rounded animate-pulse w-24" />
          <div className="h-[5px] bg-muted rounded animate-pulse w-24" />
          <div className="h-[5px] bg-muted rounded animate-pulse w-24" />
        </div>
        <div className="flex justify-between pt-1">
          <div className="h-3 bg-muted rounded animate-pulse w-16" />
          <div className="h-3 bg-muted rounded animate-pulse w-24" />
        </div>
      </div>
    </div>
  );
}
