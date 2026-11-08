CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`parent_agent_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`definition_path` text,
	`status` text NOT NULL,
	`current_task_id` text,
	`summary` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agents_session_idx` ON `agents` (`session_id`);--> statement-breakpoint
CREATE INDEX `agents_status_idx` ON `agents` (`status`);--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`scope` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_name_uq` ON `api_tokens` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_hash_uq` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text,
	`task_id` text,
	`session_id` text,
	`agent_id` text,
	`action` text NOT NULL,
	`risk_class` text NOT NULL,
	`details` text,
	`status` text NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `approvals_status_idx` ON `approval_requests` (`status`);--> statement-breakpoint
CREATE TABLE `audit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`outcome` text NOT NULL,
	`details` text
);
--> statement-breakpoint
CREATE INDEX `audit_ts_idx` ON `audit_entries` (`ts`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`reliability` text NOT NULL,
	`severity` text NOT NULL,
	`execution_id` text,
	`session_id` text,
	`agent_id` text,
	`task_id` text,
	`summary` text NOT NULL,
	`payload` text,
	`truncated` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_session_id_idx` ON `events` (`session_id`,`id`);--> statement-breakpoint
CREATE INDEX `events_execution_id_idx` ON `events` (`execution_id`,`id`);--> statement-breakpoint
CREATE INDEX `events_agent_id_idx` ON `events` (`agent_id`,`id`);--> statement-breakpoint
CREATE INDEX `events_type_ts_idx` ON `events` (`type`,`ts`);--> statement-breakpoint
CREATE INDEX `events_ts_idx` ON `events` (`ts`);--> statement-breakpoint
CREATE TABLE `executions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`prompt` text NOT NULL,
	`analysis` text,
	`mode` text,
	`strategy` text,
	`config` text NOT NULL,
	`status` text NOT NULL,
	`permission_bypass` integer DEFAULT false NOT NULL,
	`worktree_path` text,
	`verification` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `executions_project_idx` ON `executions` (`project_id`);--> statement-breakpoint
CREATE INDEX `executions_status_idx` ON `executions` (`status`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`scope` text NOT NULL,
	`source_path` text,
	`executable` integer DEFAULT false NOT NULL,
	`health` text DEFAULT 'unknown' NOT NULL,
	`permission_status` text NOT NULL,
	`metadata` text NOT NULL,
	`discovered_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `integrations_project_idx` ON `integrations` (`project_id`,`kind`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text,
	`task_id` text,
	`from_participant` text NOT NULL,
	`to_participant` text NOT NULL,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_execution_idx` ON `messages` (`execution_id`,`id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`root_path` text NOT NULL,
	`detected_stack` text NOT NULL,
	`instruction_files` text NOT NULL,
	`hooks_installed` integer DEFAULT false NOT NULL,
	`hook_token_hash` text,
	`created_at` integer NOT NULL,
	`last_analyzed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_root_path_uq` ON `projects` (`root_path`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text,
	`project_id` text,
	`runtime` text NOT NULL,
	`observe_only` integer NOT NULL,
	`cwd` text NOT NULL,
	`git_branch` text,
	`worktree_path` text,
	`model` text,
	`status` text NOT NULL,
	`capabilities` text NOT NULL,
	`pid` integer,
	`usage` text,
	`last_activity_at` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`execution_id`) REFERENCES `executions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);--> statement-breakpoint
CREATE INDEX `sessions_execution_idx` ON `sessions` (`execution_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`execution_id` text NOT NULL,
	`task_id` text NOT NULL,
	`depends_on_task_id` text NOT NULL,
	PRIMARY KEY(`execution_id`, `task_id`, `depends_on_task_id`),
	FOREIGN KEY (`execution_id`) REFERENCES `executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`execution_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`assigned_agent_role` text,
	`agent_id` text,
	`mode` text NOT NULL,
	`mechanism_reason` text,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`owned_paths` text NOT NULL,
	`risk_class` text DEFAULT 'normal' NOT NULL,
	`changed_files` text NOT NULL,
	`test_results` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`previous_attempt_id` text,
	`started_at` integer,
	`completed_at` integer,
	PRIMARY KEY(`execution_id`, `id`),
	FOREIGN KEY (`execution_id`) REFERENCES `executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE TABLE `workflow_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_node_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`status` text NOT NULL,
	`session_id` text,
	`output_summary` text,
	`error` text,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_node_runs_run_idx` ON `workflow_node_runs` (`run_id`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`execution_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`version_id`) REFERENCES `workflow_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`execution_id`) REFERENCES `executions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workflow_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`definition_id` text NOT NULL,
	`version` integer NOT NULL,
	`graph` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`definition_id`) REFERENCES `workflow_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_versions_def_ver_uq` ON `workflow_versions` (`definition_id`,`version`);