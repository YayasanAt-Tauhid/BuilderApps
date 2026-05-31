import type { CfProperties, ExecutionContext } from '@cloudflare/workers-types';
import type { SessionUser } from '$lib/server/auth';
import type { Env } from '$lib/server/env';

declare global {
	namespace App {
		interface Error {
			code?: string;
		}

		interface Locals {
			user: SessionUser | null;
			sessionId: string | null;
		}

		// eslint-disable-next-line @typescript-eslint/no-empty-object-type
		interface PageData {}

		interface Platform {
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
