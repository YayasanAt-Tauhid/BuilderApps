import type { R2Bucket } from '@cloudflare/workers-types';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { sha256 } from '@oslojs/crypto/sha2';

// R2 stores generated file CONTENT + export archives; D1 holds only metadata (ASSUMPTION-7).

/** Deterministic object key: project/<projectId>/v<version>/<path>. */
export function fileKey(projectId: string, version: number, path: string): string {
	const clean = path.replace(/^\/+/, '');
	return `project/${projectId}/v${version}/${clean}`;
}

export function exportKey(projectId: string, version: number): string {
	return `export/${projectId}/v${version}.zip`;
}

export function contentHash(content: string | Uint8Array): string {
	const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
	return encodeHexLowerCase(sha256(bytes));
}

export async function putFile(
	bucket: R2Bucket,
	key: string,
	content: string | Uint8Array,
	contentType = 'text/plain; charset=utf-8'
): Promise<void> {
	await bucket.put(key, content, { httpMetadata: { contentType } });
}

export async function getFileText(bucket: R2Bucket, key: string): Promise<string | null> {
	const obj = await bucket.get(key);
	if (!obj) return null;
	return obj.text();
}

export async function getFileStream(bucket: R2Bucket, key: string) {
	return bucket.get(key);
}

export async function deleteFiles(bucket: R2Bucket, keys: string[]): Promise<void> {
	if (keys.length === 0) return;
	await bucket.delete(keys);
}
