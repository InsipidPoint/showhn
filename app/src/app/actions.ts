"use server";

import { getPosts } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/db/schema";
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

export async function subscribe({
  email,
  frequency,
}: {
  email: string;
  frequency: "daily" | "weekly";
}): Promise<{ ok: boolean; error?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  try {
    await db
      .insert(subscribers)
      .values({ email: trimmed, frequency, createdAt: Math.floor(Date.now() / 1000) })
      .onConflictDoUpdate({
        target: subscribers.email,
        set: { frequency },
      });
    return { ok: true };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
