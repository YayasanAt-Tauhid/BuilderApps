#!/usr/bin/env bash
# BuilderPro — one-time Cloudflare resource setup + deploy helper.
#
# Run this on YOUR machine (not the Claude sandbox — that environment blocks
# api.cloudflare.com / openrouter.ai). Secrets are read from your environment;
# nothing is hardcoded or committed.
#
# Prerequisites:
#   export CLOUDFLARE_API_TOKEN=...      # your Cloudflare API token
#   export CLOUDFLARE_ACCOUNT_ID=...     # your Cloudflare account id
#   pnpm install
#
# Usage:
#   bash scripts/deploy-setup.sh create     # create D1/KV/R2/Queue, prints ids to paste
#   bash scripts/deploy-setup.sh secret      # set OPENROUTER_API_KEY on the backend worker
#   bash scripts/deploy-setup.sh migrate     # apply D1 migrations (production)
#   bash scripts/deploy-setup.sh deploy      # deploy backend FIRST, then app

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"

WR="pnpm exec wrangler"

case "${1:-}" in
	create)
		echo "Creating D1, KV, R2, and Queue. Copy the printed ids into:"
		echo "  - wrangler.jsonc            (FILL_DATABASE_ID, FILL_KV_ID)"
		echo "  - workers/backend/wrangler.jsonc (same ids)"
		echo
		$WR d1 create builderpro-db
		$WR kv namespace create KV
		$WR r2 bucket create builderpro-files
		$WR queues create builderpro-jobs
		echo
		echo "Done. Paste the database_id and kv id above into both wrangler configs."
		;;
	secret)
		# Prompts for the value, or pipe it in:  echo "$OPENROUTER_API_KEY" | bash scripts/deploy-setup.sh secret
		$WR secret put OPENROUTER_API_KEY --config workers/backend/wrangler.jsonc
		;;
	migrate)
		$WR d1 migrations apply builderpro-db --env production --remote
		;;
	deploy)
		# Deploy order matters: backend first so the app's cross-script DO binding resolves.
		$WR deploy --config workers/backend/wrangler.jsonc
		pnpm build
		$WR deploy
		;;
	*)
		echo "Usage: bash scripts/deploy-setup.sh {create|secret|migrate|deploy}" >&2
		exit 1
		;;
esac
