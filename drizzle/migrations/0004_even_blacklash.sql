ALTER TABLE `projects` ADD `supabase_project_ref` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `supabase_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `supabase_anon_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `supabase_access_token` text;--> statement-breakpoint
ALTER TABLE `users` ADD `supabase_refresh_token` text;