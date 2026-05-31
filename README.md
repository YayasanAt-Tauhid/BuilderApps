# BuilderPro

Describe an app in plain language and watch an AI build it. BuilderPro is an edge-native
full-stack app generator: SvelteKit on Cloudflare Workers, with real-time token streaming of
AI code generation over WebSockets.

> Generated from the BuilderPro PRD (`fullstack-init-prompt v2.2`). See `CLAUDE.md` for resume
> instructions and `HANDOFF.md` for current scaffold state.

## Stack

- **Framework:** SvelteKit 2 + Svelte 5 (runes), `@sveltejs/adapter-cloudflare`
- **Styling:** Tailwind v4 (CSS-first, no config file) + shadcn-svelte conventions
- **Data:** Cloudflare D1 (metadata) + R2 (generated file content) via Drizzle ORM
- **Realtime/Jobs:** Durable Objects (WS hub + generation runner), Queues, Cron
- **Auth:** self-managed Lucia-v3 session pattern (`@oslojs/*`) + PBKDF2 (Web Crypto)
- **AI:** OpenRouter `deepseek/deepseek-v4-flash` via `fetch` + SSE (no SDK)
- **i18n:** Paraglide-JS v2 · **Validation:** Valibot · **Zip:** fflate

## Topology (two workers, one repo)

- **App worker** (`builderpro`, repo root) — SvelteKit SSR/API. Forwards WS upgrades to the DO.
- **Backend worker** (`builderpro-backend`, `workers/backend/`) — owns the `RealtimeHub`
  Durable Object, the Queue consumer, and the Cron handler. Holds `OPENROUTER_API_KEY`.

Shared logic lives in `src/lib/server/**` (relative imports) and is bundled into both workers.

## Develop

```sh
pnpm install
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
pnpm dev
```

## Verify

```sh
pnpm type-check && pnpm type-check:backend
pnpm lint
pnpm test:unit --run
pnpm test:integration --run
pnpm build
```

## Deploy

1. Create the D1/KV/R2/Queue resources and fill the `FILL_*` ids in `wrangler.jsonc` and
   `workers/backend/wrangler.jsonc`.
2. Set the secret: `wrangler secret put OPENROUTER_API_KEY --config workers/backend/wrangler.jsonc`
3. Apply migrations: `pnpm db:migrate:production`
4. Deploy **backend first**, then the app: `pnpm deploy:all`
