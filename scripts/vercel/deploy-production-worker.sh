#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"

if ! git -C "$root" diff --quiet || ! git -C "$root" diff --cached --quiet; then
  echo "Refusing production deploy from a dirty German-worker checkout." >&2
  exit 2
fi

git -C "$root" fetch origin main
git -C "$root" checkout main
git -C "$root" pull --ff-only origin main
cd "$root"

# Keep credentials on the server. The file is intentionally outside the repo.
if [ -f "$HOME/.config/3dvr/money-printer.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$HOME/.config/3dvr/money-printer.env"
  set +a
fi

export VERCEL_ORG_ID="team_xxJGO7S7h1ZP4BHidYV0CX9Z"
export VERCEL_PROJECT_ID="prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch"

if command -v vercel >/dev/null 2>&1; then
  vercel_cmd=(vercel)
else
  vercel_cmd=(npx --yes vercel@latest)
fi

auth_args=()
if [ -n "${VERCEL_TOKEN:-}" ]; then
  auth_args=(--token "$VERCEL_TOKEN")
fi

# If no explicit token is configured, the CLI may use the German server's
# existing Vercel login. Either way, never print credentials.
"${vercel_cmd[@]}" pull --yes --environment=production "${auth_args[@]}"
"${vercel_cmd[@]}" build --prod "${auth_args[@]}"
deploy_url="$("${vercel_cmd[@]}" deploy --prebuilt --prod --yes "${auth_args[@]}")"

echo "Production deployment created: $deploy_url"
