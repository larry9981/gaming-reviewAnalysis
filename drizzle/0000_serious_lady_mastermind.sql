CREATE TABLE `checkout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan` text NOT NULL,
	`app_id` text,
	`provider` text NOT NULL,
	`provider_session_id` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`app_id` text,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`provider_ref` text,
	`current_period_end` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_reports` (
	`app_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`risk_score` integer NOT NULL,
	`verdict` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);