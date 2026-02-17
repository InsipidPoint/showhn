import { getPost } from "@/lib/db/queries";
import { sanitizeHtml } from "@/lib/sanitize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(parseInt(id, 10));
  if (!post) return { title: "Not Found" };

  const title = post.title.replace(/^Show HN:\s*/i, "");
  return {
    title: `${title} — HN Showcase`,
    description: post.analysis?.summary || `Show HN: ${title}`,
    openGraph: {
      title: `${title} — HN Showcase`,
      description: post.analysis?.summary || `Show HN: ${title}`,
    },
  };
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const colors = [
    "",
    "bg-red-400 dark:bg-red-500",
    "bg-orange-400 dark:bg-orange-500",
    "bg-yellow-400 dark:bg-yellow-500",
    "bg-emerald-400 dark:bg-emerald-500",
    "bg-green-500 dark:bg-green-400",
  ];
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`w-5 h-2 rounded-sm transition-colors ${
              i <= score ? colors[score] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">
        {score}/5{label && ` — ${label}`}
      </span>
    </div>
  );
}

const vibeLabels: Record<number, string> = {
  1: "Weekend hack",
  2: "Side project",
  3: "Solid tool",
  4: "Polished product",
  5: "Serious startup",
};

const sentimentColors: Record<string, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  mixed: "text-yellow-600 dark:text-yellow-400",
  neutral: "text-muted-foreground",
};

export default async function PostPage({ params }: Props) {
  const { id } = await params;
  const post = await getPost(parseInt(id, 10));
  if (!post) notFound();

  const displayTitle = post.title.replace(/^Show HN:\s*/i, "");
  const hnUrl = `https://news.ycombinator.com/item?id=${post.id}`;
  const date = new Date(post.createdAt * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const techStack: string[] = post.analysis?.techStack
    ? JSON.parse(post.analysis.techStack)
    : [];
  const tags: string[] = post.analysis?.tags
    ? JSON.parse(post.analysis.tags)
    : [];

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
        Back to browse
      </Link>

      {/* Screenshot */}
      <div className="rounded-lg border border-border overflow-hidden bg-muted mb-6">
        {post.hasScreenshot ? (
          <div className="relative aspect-[16/10]">
            <Image
              src={`/screenshots/${post.id}.webp`}
              alt={displayTitle}
              fill
              className="object-cover object-top"
              priority
            />
          </div>
        ) : (
          <div className="aspect-[16/10] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 opacity-30"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              <p className="text-sm">{post.status === "no_url" ? "Text-only post" : "Screenshot processing..."}</p>
            </div>
          </div>
        )}
      </div>

      {/* Title + meta */}
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">{displayTitle}</h1>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mb-4">
        <span>by <span className="font-medium text-foreground">{post.author}</span></span>
        <span>&middot;</span>
        <span>{date}</span>
        <span>&middot;</span>
        <span>{post.points} points</span>
        <span>&middot;</span>
        <span>{post.comments} comments</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {post.url && (
          <Button asChild>
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              Visit Project
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
            </a>
          </Button>
        )}
        <Button variant="outline" asChild>
          <a href={hnUrl} target="_blank" rel="noopener noreferrer">
            View on HN
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
          </a>
        </Button>
      </div>

      {/* AI Analysis */}
      {post.analysis && (
        <div className="border border-border rounded-lg overflow-hidden mb-6">
          <div className="bg-accent/50 px-6 py-3 border-b border-border">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4Z"/></svg>
              AI Analysis
            </h2>
          </div>
          <div className="p-6 space-y-5">
            {post.analysis.summary && (
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Summary</span>
                <p className="mt-1 leading-relaxed">{post.analysis.summary}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {post.analysis.category && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</span>
                  <div className="mt-1.5">
                    <Badge>{post.analysis.category}</Badge>
                  </div>
                </div>
              )}

              {post.analysis.targetAudience && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target Audience</span>
                  <p className="mt-1">{post.analysis.targetAudience}</p>
                </div>
              )}

              {post.analysis.vibeScore && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vibe</span>
                  <div className="mt-1.5">
                    <ScoreBar score={post.analysis.vibeScore} label={vibeLabels[post.analysis.vibeScore] || ""} />
                  </div>
                </div>
              )}

              {post.analysis.interestScore && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Interest</span>
                  <div className="mt-1.5">
                    <ScoreBar score={post.analysis.interestScore} label="" />
                  </div>
                </div>
              )}

              {post.analysis.commentSentiment && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">HN Sentiment</span>
                  <p className={`mt-1 capitalize font-medium ${sentimentColors[post.analysis.commentSentiment] || "text-muted-foreground"}`}>
                    {post.analysis.commentSentiment}
                  </p>
                </div>
              )}
            </div>

            {techStack.length > 0 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tech Stack</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {techStack.map((tech) => (
                    <Badge key={tech} variant="secondary">{tech}</Badge>
                  ))}
                </div>
              </div>
            )}

            {tags.length > 0 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Story text if present */}
      {post.storyText && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-6 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Post Description</h2>
          </div>
          <div className="p-6">
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.storyText) }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
