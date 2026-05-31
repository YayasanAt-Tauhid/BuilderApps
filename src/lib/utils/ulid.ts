import { ulid as generateUlid } from 'ulid';

/** Monotonic-friendly ULID. Used for all entity ids (PRD §11.2). */
export function ulid(): string {
	return generateUlid();
}
