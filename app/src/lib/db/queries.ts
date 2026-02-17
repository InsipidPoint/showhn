import { db } from "./index";
import { posts, aiAnalysis } from "./schema";
import { desc, eq, gte, and, inArray, sql } from "drizzle-orm";
import type { Post, AiAnalysis } from "./schema";

type TimeRange = "today" | "week" | "month" | "all";
type SortOption = "newest" | "points" | "comments" | "interesting";

function getTimeFilter(range: TimeRange): number {
  const now = Math.floor(Date.now() / 1000);
  switch (range) {
    case "today":
      return now - 24 * 60 * 60;
    case "week":
      return now - 7 * 24 * 60 * 60;
    case "month":
      return now - 30 * 24 * 60 * 60;
    case "all":
      return 0;
  }
}

export async function getPosts({
  time = "week",
  sort = "newest",
  categories = [],
  limit = 48,
  offset = 0,
}: {
  time?: TimeRange;
  sort?: SortOption;
  categories?: string[];
  limit?: number;
  offset?: number;
} = {}): Promise<{ posts: (Post & { analysis: AiAnalysis | null })[]; total: number }> {
  const timeFilter = getTimeFilter(time);

  const conditions: ReturnType<typeof gte>[] = [gte(posts.createdAt, timeFilter)];

  // Add category filter in SQL so it works correctly with LIMIT
  if (categories.length > 0) {
    conditions.push(inArray(aiAnalysis.category, categories));
  }

  // Build query with left join (inner join when filtering by category)
  const joinType = categories.length > 0 ? "inner" : "left";
  let baseQuery = joinType === "inner"
    ? db.select().from(posts).innerJoin(aiAnalysis, eq(posts.id, aiAnalysis.postId))
    : db.select().from(posts).leftJoin(aiAnalysis, eq(posts.id, aiAnalysis.postId));

  let query = baseQuery
    .where(and(...conditions))
    .limit(limit)
    .offset(offset);

  // Apply sort
  switch (sort) {
    case "newest":
      query = query.orderBy(desc(posts.createdAt)) as typeof query;
      break;
    case "points":
      query = query.orderBy(desc(posts.points)) as typeof query;
      break;
    case "comments":
      query = query.orderBy(desc(posts.comments)) as typeof query;
      break;
    case "interesting":
      query = query.orderBy(desc(aiAnalysis.pickScore), desc(posts.createdAt)) as typeof query;
      break;
  }

  const results = query.all();

  // Get total count (without limit/offset) for the same filters
  const countQuery = joinType === "inner"
    ? db.select({ count: sql<number>`count(*)` }).from(posts).innerJoin(aiAnalysis, eq(posts.id, aiAnalysis.postId)).where(and(...conditions))
    : db.select({ count: sql<number>`count(*)` }).from(posts).leftJoin(aiAnalysis, eq(posts.id, aiAnalysis.postId)).where(and(...conditions));
  const total = countQuery.get()?.count ?? 0;

  return {
    posts: results.map((r) => ({
      ...r.posts,
      analysis: r.ai_analysis,
    })),
    total,
  };
}

export async function getCategories(): Promise<string[]> {
  const results = db
    .selectDistinct({ category: aiAnalysis.category })
    .from(aiAnalysis)
    .where(sql`${aiAnalysis.category} IS NOT NULL`)
    .all();

  return results.map((r) => r.category!).sort();
}

export async function searchPosts(
  query: string,
  limit = 48
): Promise<(Post & { analysis: AiAnalysis | null })[]> {
  if (!query.trim()) return [];

  // FTS5 search — use raw SQL since Drizzle doesn't support virtual tables
  const { sqlite } = await import("./index");

  const rows = sqlite
    .prepare(
      `SELECT p.*, a.post_id as a_post_id, a.summary as a_summary, a.category as a_category,
              a.tech_stack as a_tech_stack, a.target_audience as a_target_audience,
              a.vibe_score as a_vibe_score, a.interest_score as a_interest_score,
              a.comment_sentiment as a_comment_sentiment, a.tags as a_tags,
              a.novelty_score as a_novelty_score, a.ambition_score as a_ambition_score,
              a.usefulness_score as a_usefulness_score, a.pick_reason as a_pick_reason,
              a.pick_score as a_pick_score,
              a.tier as a_tier, a.vibe_tags as a_vibe_tags,
              a.analyzed_at as a_analyzed_at, a.model as a_model
       FROM posts_fts fts
       JOIN posts p ON p.id = fts.rowid
       LEFT JOIN ai_analysis a ON p.id = a.post_id
       WHERE posts_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(query, limit) as any[];

  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    author: r.author,
    points: r.points,
    comments: r.comments,
    createdAt: r.created_at,
    storyText: r.story_text,
    hasScreenshot: r.has_screenshot,
    status: r.status,
    fetchedAt: r.fetched_at,
    updatedAt: r.updated_at,
    analysis: r.a_post_id
      ? {
          postId: r.a_post_id,
          summary: r.a_summary,
          category: r.a_category,
          techStack: r.a_tech_stack,
          targetAudience: r.a_target_audience,
          vibeScore: r.a_vibe_score,
          interestScore: r.a_interest_score,
          commentSentiment: r.a_comment_sentiment,
          tags: r.a_tags,
          noveltyScore: r.a_novelty_score,
          ambitionScore: r.a_ambition_score,
          usefulnessScore: r.a_usefulness_score,
          pickReason: r.a_pick_reason,
          pickScore: r.a_pick_score,
          tier: r.a_tier,
          vibeTags: r.a_vibe_tags,
          analyzedAt: r.a_analyzed_at,
          model: r.a_model,
        }
      : null,
  }));
}

export async function getDigest(date?: string): Promise<{
  date: string;
  topPosts: (Post & { analysis: AiAnalysis | null })[];
  aiPicks: (Post & { analysis: AiAnalysis | null })[];
  stats: { total: number; categories: Record<string, number> };
}> {
  // Parse date or use today
  const targetDate = date ? new Date(date + "T00:00:00Z") : new Date();
  const dayStart = Math.floor(new Date(targetDate.toISOString().split("T")[0] + "T00:00:00Z").getTime() / 1000);
  const dayEnd = dayStart + 24 * 60 * 60;

  const dayPosts = db
    .select()
    .from(posts)
    .leftJoin(aiAnalysis, eq(posts.id, aiAnalysis.postId))
    .where(and(gte(posts.createdAt, dayStart), sql`${posts.createdAt} < ${dayEnd}`))
    .all();

  const mapped = dayPosts.map((r) => ({
    ...r.posts,
    analysis: r.ai_analysis,
  }));

  // Top by points
  const topPosts = [...mapped].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).slice(0, 10);

  // AI picks — gem and banger tier projects, then by points
  const aiPicks = [...mapped]
    .filter((p) => {
      const tier = p.analysis?.tier;
      return tier === "gem" || tier === "banger";
    })
    .sort((a, b) => (b.analysis?.pickScore || 0) - (a.analysis?.pickScore || 0) || (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 6);

  // Category breakdown
  const categories: Record<string, number> = {};
  for (const p of mapped) {
    const cat = p.analysis?.category;
    if (cat) categories[cat] = (categories[cat] || 0) + 1;
  }

  return {
    date: targetDate.toISOString().split("T")[0],
    topPosts,
    aiPicks,
    stats: { total: mapped.length, categories },
  };
}

export async function getPost(id: number): Promise<(Post & { analysis: AiAnalysis | null }) | null> {
  const result = db
    .select()
    .from(posts)
    .leftJoin(aiAnalysis, eq(posts.id, aiAnalysis.postId))
    .where(eq(posts.id, id))
    .get();

  if (!result) return null;

  return {
    ...result.posts,
    analysis: result.ai_analysis,
  };
}
