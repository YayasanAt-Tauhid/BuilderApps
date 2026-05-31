# HANDOFF.md — Progress State

Updated: 2026-05-31 · Phase: 2 (scaffold) · Context budget used: ~70%

## Files completed (all core scaffold)

- [x] Root config (package.json pinned per §10.3, tsconfig, svelte/vite/tailwind v4,
      wrangler app + backend + test, eslint, prettier, drizzle, vitest x2, playwright)
- [x] src app shell (app.html, error.html, app.css tokens, app.d.ts, hooks.server.ts)
- [x] src/lib/server shared modules (db schema + Drizzle, auth session + PBKDF2, ai
      OpenRouter + SSE + parser, usage/quota, R2 storage, rate-limit, security headers,
      api envelope, context guards, env, jobs/types)
- [x] src/lib utils (cn, ulid, slug) + Valibot schemas
- [x] i18n (Paraglide v2 compiled; en + id catalogs)
- [x] routes: (public) landing/about, (auth) login/register/logout, (protected)
      dashboard/settings/projects[id]/files/preview, full /api/v1/\*\* surface (§9)
- [x] workers/backend (index, RealtimeHub DO, queue consumer, cron)
- [x] drizzle/migrations/0000\_\*.sql generated
- [x] tests: unit (19 passing) + integration (KV via workerd) + e2e smoke
- [x] .github/workflows/ci.yml

## Next action

DEPLOYED & live (Cloudflare account 2f85a...): app worker
`builderpro.yayasan-attauhid-1.workers.dev` + backend worker `builderpro-backend`.
Verified end-to-end in production: auth, project CRUD, AI generation (OpenRouter
DeepSeek V4 Flash → DO → R2/D1), file browse, export zip, usage metering.

## Known issues / follow-ups

- Live token streaming via WebSocket is DISABLED. WS upgrades cannot be returned
  through a SvelteKit `+server.ts` handler on adapter-cloudflare (the 101/webSocket
  response is dropped → 500). The chat page now POLLS generation status and reloads
  the persisted assistant message on completion (reliable, no live tokens).
  To restore streaming: connect the browser directly to the backend worker's DO
  (separate origin → use a short-lived query-param token, since the session cookie
  is scoped to the app origin), or stream via an SSE ReadableStream proxied from the DO.
- Production-only bug fixed: Workers caps PBKDF2 at 100_000 iterations (was 600_000).
- Production-only bug fixed: the hand-rolled CSP `script-src 'self'` blocked SvelteKit's
  inline hydration bootstrap → the page never hydrated (Send had no handler, no spinner,
  no result). CSP is now emitted by SvelteKit (`kit.csp` hash mode) and the competing
  middleware CSP was removed; X-Frame-Options → SAMEORIGIN. Verified end-to-end in a real
  headless browser: spinner shows, generation runs, assistant reply renders, 0 console errors.

## Deploy notes

- VPS (103.67.78.41) used as deploy box: Node 22 via nvm (system Node 20 untouched),
  repo cloned at ~/builderapps with real binding ids filled in wrangler configs.
- Resource ids: D1 999239b0-9fb3-40f0-b535-99528970cc9e · KV 2b07e0f2e5c749969f609b79e17f6ddf
  · R2 builderpro-files · Queue builderpro-jobs.

## Assumptions in force

- [ASSUMPTION-1..9] per PRD §17.1 (all resolved/confirmed).
- DAILY_TOKEN_QUOTA = 200_000 tokens/day placeholder (QUESTION-6).
- Added build-time-only dep @inlang/plugin-message-format (CDN blocked by net policy;
  inlang loads the plugin from local node_modules instead of jsdelivr).

## Resolved §10.3 ⚠️ flags

- @cloudflare/vitest-pool-workers 0.16.x / vitest 4: uses the `cloudflareTest` Vite
  plugin (not the old `defineWorkersConfig`). Integration tests use wrangler.test.jsonc
  (omits the cross-script DO binding, which can't resolve in the test runtime).
- eslint-plugin-svelte flat-config wired in eslint.config.js (passes).

## Verification (real runs on this machine)

✅ pnpm type-check — 0 errors (1 advisory svelte warning: intentional state seed)
✅ pnpm type-check:backend — 0 errors
✅ pnpm lint — clean (prettier + eslint)
✅ pnpm test:unit --run — 19/19 pass
✅ pnpm test:integration --run — 1/1 pass (workerd + KV binding)
✅ pnpm build — app builds; backend bundles (wrangler --dry-run, 48 KiB gzip)
✅ Quality gates: no `any`, no console.log, no hardcoded secrets
