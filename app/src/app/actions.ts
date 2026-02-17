"use server";

import { getPosts } from "@/lib/db/queries";
import type { Post, AiAnalysis } from "@/lib/db/schema";

export async function loadMorePosts({
  time = "week",
  sort = "newest",
  categories = [],
  offset = 0,
  limit = 48,
}: {
  time?: string;
  sort?: string;
  categories?: string[];
  offset?: number;
  limit?: number;
}): Promise<{ posts: (Post & { analysis: AiAnalysis | null })[] }> {
  const { posts } = await getPosts({
    time: time as "today" | "week" | "month" | "all",
    sort: sort as "newest" | "points" | "comments" | "interesting",
    categories,
    offset,
    limit,
  });
  return { posts };
}
