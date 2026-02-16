CREATE TABLE `ai_analysis` (
	`post_id` integer PRIMARY KEY NOT NULL,
	`summary` text,
	`category` text,
	`tech_stack` text,
	`target_audience` text,
	`vibe_score` integer,
	`interest_score` integer,
	`comment_sentiment` text,
	`tags` text,
	`analyzed_at` integer NOT NULL,
	`model` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_analysis_category` ON `ai_analysis` (`category`);--> statement-breakpoint
CREATE INDEX `idx_analysis_vibe` ON `ai_analysis` (`vibe_score`);--> statement-breakpoint
CREATE INDEX `idx_analysis_interest` ON `ai_analysis` (`interest_score`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`author` text NOT NULL,
	`points` integer DEFAULT 0,
	`comments` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`story_text` text,
	`has_screenshot` integer DEFAULT 0,
	`status` text DEFAULT 'active',
	`fetched_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_posts_created` ON `posts` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_posts_points` ON `posts` (`points`);