"use server";

import { getPosts } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/db/schema";
import type { Post, AiAnalysis } from "@/lib/db/schema";

const VALID_TIMES = ["today", "week", "month", "all"] as const;
const VALID_SORTS = ["newest", "points", "comments", "interesting"] as const;
const MAX_LIMIT = 100;

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
  const safeTime = VALID_TIMES.includes(time as typeof VALID_TIMES[number])
    ? (time as typeof VALID_TIMES[number])
    : "week";
  const safeSort = VALID_SORTS.includes(sort as typeof VALID_SORTS[number])
    ? (sort as typeof VALID_SORTS[number])
    : "newest";
  const safeLimit = Math.max(1, Math.min(limit, MAX_LIMIT));
  const safeOffset = Math.max(0, offset);

  const { posts } = await getPosts({
    time: safeTime,
    sort: safeSort,
    categories,
    offset: safeOffset,
    limit: safeLimit,
  });
  return { posts };
}

// Simple in-memory rate limiter for subscribe action
const subscribeAttempts = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // max 5 attempts per window

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const key = email.slice(0, 100); // prevent huge keys
  const attempts = (subscribeAttempts.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
  if (attempts.length >= RATE_LIMIT_MAX) return true;
  attempts.push(now);
  subscribeAttempts.set(key, attempts);
  // Periodic cleanup: if map grows large, clear old entries
  if (subscribeAttempts.size > 10000) subscribeAttempts.clear();
  return false;
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

  if (isRateLimited(trimmed)) {
    return { ok: false, error: "Too many attempts. Please try again later." };
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
