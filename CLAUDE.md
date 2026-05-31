# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BuilderPro — an edge-native "describe an app, watch the AI build it" generator. SvelteKit on
Cloudflare Workers; OpenRouter (`deepseek/deepseek-v4-flash`) generates project files that are
streamed to the browser, stored in R2, and exportable as a zip. See `HANDOFF.md` for current
deployment state and known issues, and the PRD (`*fullstackinitprompt*.md`) for full requirements.

## Commands

- `pnpm dev` — local dev server.
- `pnpm type-check` — SvelteKit sync + `svelte-check` (the app worker).
- `pnpm type-check:backend` — `tsc --noEmit` for `workers/backend` (separate tsconfig). Run BOTH;
  the shared `src/lib/server/**` is compiled by each worker independently.
- `pnpm lint` (prettier --check + eslint) · `pnpm format` (prettier --write).
- `pnpm test:unit --run` — Vitest unit tests (node env). Single file:
  `pnpm test:unit --run tests/unit/parser.test.ts`; by name: `pnpm test:unit --run -t "slugify"`.
- `pnpm test:integration --run` — Vitest inside the Workers runtime (workerd) via
  `@cloudflare/vitest-pool-workers`; uses `wrangler.test.jsonc` (no cross-script DO binding).
- `pnpm test:e2e` — Playwright (needs a browser; blocked in restricted sandboxes).
- `pnpm db:generate` — regenerate Drizzle SQL migration after editing `src/lib/server/db/schema.ts`.
- Paraglide messages are generated and git-ignored; after a clean install / before type-check run:
  `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`.

### Deploy (order matters)

`pnpm deploy:all` = `deploy:backend` then `deploy`. **Backend FIRST** — the app worker's
`DO_REALTIME` binding references the backend worker by `script_name`, so it must exist first.
Fill the `FILL_*` ids in `wrangler.jsonc` + `workers/backend/wrangler.jsonc` (create real
D1/KV/R2/Queue), set `OPENROUTER_API_KEY` on the backend worker, then `db:migrate:production`.

## Architecture (the big picture)

**Two workers, one repo (this is the central design fact).** `@sveltejs/adapter-cloudflare`
emits a `fetch`-only worker that cannot host a Durable Object, Queue consumer, or Cron handler.
So:
- **App worker** (`builderpro`, repo root) — SvelteKit SSR + `/api/v1/**`. Producer for `QUEUE`;
  holds a cross-script DO binding; holds NO secrets.
- **Backend worker** (`builderpro-backend`, `workers/backend/`) — plain TS worker that OWNS the
  `RealtimeHub` Durable Object (SQLite-backed), the Queue consumer, and Cron. Holds
  `OPENROUTER_API_KEY`.

**Shared server code** lives in `src/lib/server/**` and is imported by BOTH workers, so it must
use RELATIVE imports (no `$lib` alias — the backend bundler can't resolve it). `context.ts` is
app-only (depends on `@sveltejs/kit` + `App.*` ambient types) and is excluded from the backend
tsconfig. The `Env` (bindings) type lives in `src/lib/server/env.ts` so both sides import it.

**Generation flow (no WebSockets).** `POST /api/v1/projects/:id/messages` persists the prompt +
a `Generation` row, then triggers the DO `/start` via `ctx.waitUntil` (so generation always
completes + persists even if the client disconnects). The DO calls OpenRouter (fetch + SSE),
accumulates tokens into an in-memory buffer, and broadcasts them to subscribers. The browser
opens `GET /api/v1/projects/:id/generations/:gid/stream` (SSE), which the app worker proxies from
the DO `/subscribe`; the chat page parses the SSE token stream into a live file list, with a
`GET /api/v1/generations/:gid` polling fallback. On completion the DO writes file content to R2,
metadata + the assistant message to D1, and records usage.

**Data conventions:** ids = ULID (`text`); timestamps = Unix ms (`integer`); soft delete =
nullable `deletedAt`. Generated file CONTENT lives in R2; only METADATA in D1 (`schema.ts` is the
source of truth). Auth = self-managed Lucia-v3 session pattern (`@oslojs/*`), opaque token in an
`HttpOnly; Secure; SameSite=Strict` cookie, SHA-256 hash stored in D1 and cached in KV.

## Worker-runtime gotchas (these caused production-only failures)

- **PBKDF2 iterations are capped at 100_000** on Workers (Node accepts more, so unit tests pass
  while prod 500s). See `auth/password.ts`.
- **CSP is owned by SvelteKit** via `kit.csp` (`mode: 'hash'`) in `svelte.config.js`, which hashes
  the inline hydration bootstrap. Do NOT set a competing `Content-Security-Policy` in
  `middleware/security-headers.ts` — a second policy also blocks that inline script (breaking
  hydration entirely) and clobbers the preview route's own sandbox CSP.
- **WebSocket upgrades cannot be returned through a SvelteKit `+server.ts`** on adapter-cloudflare
  (the 101/webSocket response is dropped → 500). Use SSE (streaming `Response`) instead.
- When forwarding a DO stub call, use `stub.fetch.bind(stub)` — a detached `stub.fetch` throws
  "Illegal invocation". The Workers `Request`/`Response` types differ from DOM; cast at the seam.
- The preview route (`/api/v1/projects/:id/preview`) inlines sibling CSS/JS into the served
  index.html and serves it sandboxed; it is frontend-only (no full-stack execution).

## Tooling notes

- `@inlang/plugin-message-format` is loaded from `./node_modules/...` in
  `project.inlang/settings.json` (the jsdelivr CDN is blocked in restricted networks).
- pnpm 11 reads build approvals from `pnpm-workspace.yaml` (`onlyBuiltDependencies` +
  `allowBuilds`), not `package.json`. Versions are pinned (no `^`/`~`); do not re-resolve them.
