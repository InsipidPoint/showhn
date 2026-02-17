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
    interestScore: integer("interest_score"), // 1-5 (backward compat, derived from sub-scores)
    commentSentiment: text("comment_sentiment"),
    tags: text("tags"), // JSON array
    noveltyScore: integer("novelty_score"), // 1-10: How new/unique is this idea?
    ambitionScore: integer("ambition_score"), // 1-10: Technical depth and scope
    usefulnessScore: integer("usefulness_score"), // 1-10: Impact for target audience
    pickReason: text("pick_reason"), // One sentence: why this stands out
    pickScore: integer("pick_score"), // 0-100 composite from AI sub-scores
    analyzedAt: integer("analyzed_at").notNull(),
    model: text("model").notNull(),
  },
  (table) => [
    index("idx_analysis_category").on(table.category),
    index("idx_analysis_vibe").on(table.vibeScore),
    index("idx_analysis_interest").on(table.interestScore),
    index("idx_analysis_pick_score").on(table.pickScore),
  ]
);

export const taskQueue = sqliteTable(
  "task_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(), // screenshot, analyze
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id),
    status: text("status").default("pending").notNull(), // pending, processing, completed, failed
    priority: integer("priority").default(0), // higher = more urgent
    attempts: integer("attempts").default(0),
    maxAttempts: integer("max_attempts").default(3),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
    error: text("error"),
  },
  (table) => [
    index("idx_queue_status_priority").on(table.status, table.priority),
    index("idx_queue_type").on(table.type),
    index("idx_queue_post_id").on(table.postId),
  ]
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type AiAnalysis = typeof aiAnalysis.$inferSelect;
export type NewAiAnalysis = typeof aiAnalysis.$inferInsert;
export type TaskQueue = typeof taskQueue.$inferSelect;
export type NewTaskQueue = typeof taskQueue.$inferInsert;
