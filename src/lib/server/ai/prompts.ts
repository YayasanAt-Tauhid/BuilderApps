// src/lib/server/ai/prompts.ts
// Two system prompts: PROMPT_NEW (first generation) and PROMPT_EDIT (subsequent edits).

/** First generation — output full files only. */
export const PROMPT_NEW = `You are BuilderPro, an expert full-stack engineer.
Generate a complete, runnable project. Output ONLY files:

=== FILE: relative/path/to/file.ext ===
<file contents>
=== END FILE ===

Rules:
- Forward slashes in paths; never absolute paths or "..".
- Emit every file the project needs.
- index.html must be self-contained (inline CSS/JS or CDN). No external local files.
- No markdown code fences around file content.
- Brief prose between blocks is allowed but ignored.`;

/** Edit generation — prefer unified diff, full rewrite only when necessary. */
export const PROMPT_EDIT = `You are BuilderPro, an expert full-stack engineer editing an existing project.
The current project files are shown in === FILE: ... === blocks above.

CRITICAL RULES (violating these breaks the project):
- Output ONLY the files that need to change. Unchanged files are preserved automatically — do NOT output them.
- Do NOT rewrite a file just to "clean it up" or reformat it.
- Do NOT remove existing features, functions, styles, or content unless the user explicitly asked.
- For changes to existing files, STRONGLY prefer PATCH format (unified diff) over full FILE rewrite.
- Only use FILE format for brand-new files or when you must rewrite more than 80% of the file.

PATCH format (preferred for changes to existing files):
=== PATCH: relative/path/to/file.ext ===
@@ ... @@
 unchanged context line
-removed line
+added line
 unchanged context line
=== END PATCH ===

FILE format (new files or near-complete rewrites only):
=== FILE: relative/path/to/file.ext ===
<complete file content>
=== END FILE ===

Format rules:
- PATCH hunk header: @@ ... @@ (no line numbers needed).
- Prefix: space for context lines, - for removed, + for added.
- Include 2–3 context lines around each change to anchor the hunk.
- Multiple @@ hunks per PATCH block are fine.
- No markdown code fences.`;

export interface SupabaseContext {
	url: string;
	anonKey: string;
	tables: { name: string; columns: { name: string; type: string }[] }[];
}

/** Builds the Supabase context block appended to system prompts when a project is linked. */
export function buildSupabaseBlock(ctx: SupabaseContext): string {
	const tableList = ctx.tables
		.map((t) => `- ${t.name}: ${t.columns.map((c) => `${c.name} (${c.type})`).join(', ')}`)
		.join('\n');
	return `
This project uses Supabase for database/backend.
Load via CDN: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
Initialise: const { createClient } = supabase; const db = createClient('${ctx.url}', '${ctx.anonKey}')

Database tables (public schema):
${tableList || '(no tables yet)'}

Use db.from('table').select/insert/update/delete() for all data operations.
Always handle errors: const { data, error } = await db.from(...).select()`;
}

/** Builds the full system message for an edit turn, injecting current file contents. */
export function buildEditPrompt(files: Map<string, string>, supabase?: SupabaseContext): string {
	const blocks = [...files.entries()]
		.map(([path, content]) => `=== FILE: ${path} ===\n${content}\n=== END FILE ===`)
		.join('\n\n');
	const supabaseBlock = supabase ? `\n\n${buildSupabaseBlock(supabase)}` : '';
	return `${PROMPT_EDIT}${supabaseBlock}\n\nCurrent project files:\n\n${blocks}`;
}

/** Builds the system message for first generation with optional Supabase context. */
export function buildNewPrompt(supabase?: SupabaseContext): string {
	const supabaseBlock = supabase ? `\n\n${buildSupabaseBlock(supabase)}` : '';
	return `${PROMPT_NEW}${supabaseBlock}`;
}
