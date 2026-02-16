import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/^show hn:\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const allPosts = db
    .select({ id: posts.id, title: posts.title, updatedAt: posts.updatedAt })
    .from(posts)
    .orderBy(desc(posts.createdAt))
    .limit(1000)
    .all();

  const postEntries: MetadataRoute.Sitemap = allPosts.map((post) => ({
    url: `https://hnshowcase.com/post/${post.id}/${slugify(post.title)}`,
    lastModified: new Date(post.updatedAt * 1000),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [
    {
      url: "https://hnshowcase.com",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: "https://hnshowcase.com/digest",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: "https://hnshowcase.com/search",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
    ...postEntries,
  ];
}
