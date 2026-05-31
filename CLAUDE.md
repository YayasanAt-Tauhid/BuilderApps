# CLAUDE.md — Resume Instructions

## Project

- Name: BuilderPro
- Stack: SvelteKit + Cloudflare Workers (see §10.3 of the PRD / package.json for pinned versions)
- Topology: Two workers (app at repo root + `workers/backend`)

## How to resume

1. Read this file, then HANDOFF.md.
2. Do NOT re-resolve versions — use package.json as the source of truth (pinned, no `^`/`~`).
3. Continue from the "Next action" in HANDOFF.md, honoring the phase gates.

## Invariants

- §0–§17 PRD structure is fixed. Anti-hallucination rules (§0.6) always apply: never invent
  package names, versions, or API signatures.
- `src/lib/server/**` uses RELATIVE imports (shared by both workers; the backend bundler must
  resolve them without the `$lib` alias).
- Verification = real `pnpm type-check && pnpm lint` at batch points (Rule 11.3), or "// VERIFY"
  flags if execution is unavailable.
- IDs = ULID (`text`); timestamps = Unix ms (`integer`); soft delete = nullable `deletedAt`.
- Generated file CONTENT lives in R2; only METADATA in D1.
- The backend worker owns the `RealtimeHub` Durable Object, the Queue consumer, and Cron.
  The app worker holds no secrets and forwards WS upgrades to the DO via a cross-script binding.

## Key commands

- pnpm type-check · pnpm lint · pnpm test:unit --run · pnpm build
- pnpm deploy:backend && pnpm deploy (deploy order: backend FIRST)

## Architecture notes

- Auth: self-managed Lucia-v3 session pattern with `@oslojs/crypto` + `@oslojs/encoding`;
  password hashing via PBKDF2 (Web Crypto `crypto.subtle`). No `lucia`/`oslo` packages.
- AI: OpenRouter `deepseek/deepseek-v4-flash` via `fetch` + SSE. No SDK. Secret =
  `OPENROUTER_API_KEY` on the backend worker only.
- i18n: `@inlang/paraglide-js` v2 (Vite plugin). Styling: Tailwind v4 (CSS-first, no config file).
