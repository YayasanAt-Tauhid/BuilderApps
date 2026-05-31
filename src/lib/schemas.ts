import * as v from 'valibot';

// All state-mutating routes validate input via these schemas before any DB write (PRD §9).

export const emailSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.email('Please enter a valid email address.'),
	v.maxLength(254)
);

export const passwordSchema = v.pipe(
	v.string(),
	v.minLength(8, 'Password must be at least 8 characters.'),
	v.maxLength(256, 'Password is too long.')
);

export const registerSchema = v.object({
	email: emailSchema,
	password: passwordSchema,
	displayName: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)))
});

export const loginSchema = v.object({
	email: emailSchema,
	password: v.pipe(v.string(), v.minLength(1, 'Password is required.'))
});

export const createProjectSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, 'A project name is required.'),
		v.maxLength(120)
	),
	description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000)))
});

export const updateProjectSchema = v.object({
	name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))),
	description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000)))
});

export const createMessageSchema = v.object({
	content: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, 'Please describe what you want to build.'),
		v.maxLength(8000)
	)
});

export const updatePreferencesSchema = v.object({
	locale: v.optional(v.picklist(['en', 'id'])),
	theme: v.optional(v.picklist(['system', 'light', 'dark']))
});

export type RegisterInput = v.InferOutput<typeof registerSchema>;
export type LoginInput = v.InferOutput<typeof loginSchema>;
export type CreateProjectInput = v.InferOutput<typeof createProjectSchema>;
export type UpdateProjectInput = v.InferOutput<typeof updateProjectSchema>;
export type CreateMessageInput = v.InferOutput<typeof createMessageSchema>;
export type UpdatePreferencesInput = v.InferOutput<typeof updatePreferencesSchema>;

/** Parse helper returning a discriminated result for API routes. */
export function parse<TSchema extends v.GenericSchema>(
	schema: TSchema,
	input: unknown
):
	| { success: true; data: v.InferOutput<TSchema> }
	| { success: false; issues: v.BaseIssue<unknown>[] } {
	const result = v.safeParse(schema, input);
	if (result.success) return { success: true, data: result.output };
	return { success: false, issues: result.issues };
}
