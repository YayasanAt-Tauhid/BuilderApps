import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { DB } from '../db';
import { sessions, users } from '../db/schema';
import { ulid } from '../../utils/ulid';

// Self-managed sessions following the documented Lucia-v3 pattern (PRD §12.1).
// - Opaque random token in the cookie; only its SHA-256 hash is stored at rest.
// - D1 is the source of truth; KV caches active sessions for fast edge reads.

export const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const RENEW_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15; // renew when < 15 days left
const KV_PREFIX = 'session:';

export interface SessionUser {
	id: string;
	email: string;
	displayName: string | null;
	role: 'user' | 'admin';
	locale: string;
	theme: 'system' | 'light' | 'dark';
}

export interface SessionValidationResult {
	session: { id: string; userId: string; expiresAt: number } | null;
	user: SessionUser | null;
}

interface CachedSession {
	id: string;
	userId: string;
	expiresAt: number;
	user: SessionUser;
}

export function generateSessionToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(20));
	return encodeBase32LowerCaseNoPadding(bytes);
}

export function hashToken(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export async function createSession(
	db: DB,
	kv: KVNamespace,
	token: string,
	userId: string
): Promise<{ id: string; userId: string; expiresAt: number }> {
	const sessionId = hashToken(token);
	const now = Date.now();
	const expiresAt = now + SESSION_TTL_MS;
	await db.insert(sessions).values({
		id: sessionId,
		userId,
		expiresAt,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	});
	return { id: sessionId, userId, expiresAt };
}

export async function validateSessionToken(
	db: DB,
	kv: KVNamespace,
	token: string
): Promise<SessionValidationResult> {
	const sessionId = hashToken(token);

	// Fast path: KV cache.
	const cached = await kv.get<CachedSession>(KV_PREFIX + sessionId, 'json');
	if (cached) {
		if (Date.now() >= cached.expiresAt) {
			await invalidateSession(db, kv, sessionId);
			return { session: null, user: null };
		}
		return {
			session: { id: cached.id, userId: cached.userId, expiresAt: cached.expiresAt },
			user: cached.user
		};
	}

	// Slow path: D1 (source of truth) joined with the user row.
	const rows = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId))
		.limit(1);

	const row = rows[0];
	if (!row || row.session.deletedAt !== null) {
		return { session: null, user: null };
	}

	const now = Date.now();
	if (now >= row.session.expiresAt) {
		await invalidateSession(db, kv, sessionId);
		return { session: null, user: null };
	}

	const user = toSessionUser(row.user);
	let expiresAt = row.session.expiresAt;

	// Sliding expiration: renew when close to expiry.
	if (now >= row.session.expiresAt - RENEW_THRESHOLD_MS) {
		expiresAt = now + SESSION_TTL_MS;
		await db.update(sessions).set({ expiresAt, updatedAt: now }).where(eq(sessions.id, sessionId));
	}

	await cacheSession(kv, { id: sessionId, userId: user.id, expiresAt, user });
	return { session: { id: sessionId, userId: user.id, expiresAt }, user };
}

export async function invalidateSession(db: DB, kv: KVNamespace, sessionId: string): Promise<void> {
	const now = Date.now();
	await db
		.update(sessions)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(sessions.id, sessionId));
	await kv.delete(KV_PREFIX + sessionId);
}

/** Logout all devices (PRD §12.2 — Should). Invalidates every session for the user. */
export async function invalidateAllSessions(
	db: DB,
	kv: KVNamespace,
	userId: string
): Promise<void> {
	const now = Date.now();
	const rows = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(eq(sessions.userId, userId));
	await db
		.update(sessions)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(sessions.userId, userId));
	await Promise.all(rows.map((r) => kv.delete(KV_PREFIX + r.id)));
}

async function cacheSession(kv: KVNamespace, value: CachedSession): Promise<void> {
	const ttlSeconds = Math.max(60, Math.floor((value.expiresAt - Date.now()) / 1000));
	await kv.put(KV_PREFIX + value.id, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

function toSessionUser(u: typeof users.$inferSelect): SessionUser {
	return {
		id: u.id,
		email: u.email,
		displayName: u.displayName,
		role: u.role,
		locale: u.locale,
		theme: u.theme
	};
}

/** Helper used by the register flow to mint a User id. */
export function newUserId(): string {
	return ulid();
}
