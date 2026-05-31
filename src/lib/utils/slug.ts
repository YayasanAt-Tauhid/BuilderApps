/** URL-safe slug from a project name. Uniqueness (per user) is enforced at the DB layer. */
export function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return base || 'project';
}

/** Append a short random suffix to de-collide slugs. */
export function uniqueSlug(input: string): string {
	const suffix = Math.random().toString(36).slice(2, 8);
	return `${slugify(input)}-${suffix}`;
}
