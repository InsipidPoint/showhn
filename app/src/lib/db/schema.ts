import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey(), // HN item ID
    title: text("title").notNull(),
    url: text("url"), // project URL (null for text-only posts)
    author: text("author").notNull(),
    points: integer("points").default(0),
    comments: integer("comments").default(0),
    createdAt: integer("created_at").notNull(), // unix timestamp
    storyText: text("story_text"),
    hasScreenshot: integer("has_screenshot").default(0),
    status: text("status").default("active"), // active/dead/no_url
    fetchedAt: integer("fetched_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_posts_created").on(table.createdAt),
    index("idx_posts_points").on(table.points),
  ]
);

export const aiAnalysis = sqliteTable(
  "ai_analysis",
  {
    postId: integer("post_id")
      .primaryKey()
      .references(() => posts.id),
    summary: text("summary"),
    category: text("category"),
    techStack: text("tech_stack"), // JSON array
    targetAudience: text("target_audience"),
    vibeScore: integer("vibe_score"), // 1-5
    interestScore: integer("interest_score"), // 1-5
    commentSentiment: text("comment_sentiment"),
    tags: text("tags"), // JSON array
    analyzedAt: integer("analyzed_at").notNull(),
    model: text("model").notNull(),
  },
  (table) => [
    index("idx_analysis_category").on(table.category),
    index("idx_analysis_vibe").on(table.vibeScore),
    index("idx_analysis_interest").on(table.interestScore),
  ]
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type AiAnalysis = typeof aiAnalysis.$inferSelect;
export type NewAiAnalysis = typeof aiAnalysis.$inferInsert;
