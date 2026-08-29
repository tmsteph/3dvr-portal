#!/usr/bin/env bash
set -euo pipefail

repo="${1:-$HOME/.3dvr/portal}"
team_id="${VERCEL_TEAM_ID:-team_KXuVUd00RMnDsjoqwdREcZ7J}"
scope_slug="${VERCEL_SCOPE_SLUG:-3dvr}"
project_name="${PROJECT_NAME:-3dvr-os}"
project_domain="${PROJECT_DOMAIN:-os.3dvr.tech}"
env_file="${MONEY_PRINTER_ENV_FILE:-$HOME/.config/3dvr/money-printer.env}"

if [ -r "$env_file" ]; then
  set -a
  . "$env_file"
  set +a
fi

if command -v vercel >/dev/null 2>&1; then
  vercel_cmd=(vercel)
elif command -v npx >/dev/null 2>&1; then
  vercel_cmd=(npx --yes vercel@latest)
else
  echo 'Neither vercel nor npx is installed on this worker.' >&2
  exit 1
fi

auth_mode=''
token_args=()
if [ -n "${VERCEL_TOKEN:-}" ]; then
  auth_status="$(curl -sS -o /tmp/3dvr-vercel-user.json -w '%{http_code}' -H "Authorization: Bearer $VERCEL_TOKEN" 'https://api.vercel.com/v2/user' || true)"
  if [ "$auth_status" = 200 ]; then
    auth_mode='token'
    token_args=(--token "$VERCEL_TOKEN")
  else
    echo 'Stored Vercel token is stale; trying the CLI session instead.'
    unset VERCEL_TOKEN
  fi
fi

if [ -z "$auth_mode" ]; then
  if "${vercel_cmd[@]}" whoami >/dev/null 2>&1; then
    auth_mode='session'
  else
    echo 'No valid Vercel token or authenticated Vercel CLI session is available.' >&2
    exit 1
  fi
fi

echo "Vercel authentication mode: $auth_mode"
echo "Vercel scope: $scope_slug ($team_id)"

mkdir -p "$(dirname "$repo")"
if [ ! -d "$repo/.git" ]; then
  git clone "https://github.com/${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}.git" "$repo"
fi

git -C "$repo" reset --hard
git -C "$repo" clean -fd
git -C "$repo" fetch --prune origin main
git -C "$repo" checkout -B main origin/main
git -C "$repo" reset --hard origin/main
git -C "$repo" clean -fd

cd "$repo/3dvr-os"
rm -rf .vercel

deploy_url=''
if [ "$auth_mode" = token ]; then
  auth=(-H "Authorization: Bearer $VERCEL_TOKEN" -H 'Content-Type: application/json')
  status="$(curl -sS -o /tmp/3dvr-os-project.json -w '%{http_code}' "${auth[@]}" "https://api.vercel.com/v9/projects/$project_name?teamId=$team_id")"
  if [ "$status" = 404 ]; then
    cat > /tmp/3dvr-os-project-create.json <<JSON
{"name":"$project_name","gitRepository":{"repo":"https://github.com/${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}","type":"github"},"rootDirectory":"3dvr-os"}
JSON
    status="$(curl -sS -o /tmp/3dvr-os-project.json -w '%{http_code}' -X POST "${auth[@]}" "https://api.vercel.com/v11/projects?teamId=$team_id" --data-binary @/tmp/3dvr-os-project-create.json)"
  fi
  case "$status" in 200|201) ;; *) cat /tmp/3dvr-os-project.json >&2; exit 1 ;; esac
  project_id="$(python3 - <<'PY'
import json
print(json.load(open('/tmp/3dvr-os-project.json'))['id'])
PY
)"
  export VERCEL_ORG_ID="$team_id" VERCEL_PROJECT_ID="$project_id"
  "${vercel_cmd[@]}" pull --yes --environment=production "${token_args[@]}"
  "${vercel_cmd[@]}" build --prod "${token_args[@]}"
  deploy_url="$("${vercel_cmd[@]}" deploy --prebuilt --prod --yes "${token_args[@]}")"
else
  if ! "${vercel_cmd[@]}" project inspect "$project_name" --scope "$scope_slug" >/dev/null 2>&1; then
    "${vercel_cmd[@]}" project add "$project_name" --scope "$scope_slug"
  fi
  "${vercel_cmd[@]}" link --yes --project "$project_name" --scope "$scope_slug"
  deploy_url="$("${vercel_cmd[@]}" deploy --prod --yes --scope "$scope_slug")"
  "${vercel_cmd[@]}" domains add "$project_domain" "$project_name" --scope "$scope_slug" --force || true
  "${vercel_cmd[@]}" alias set "$deploy_url" "$project_domain" --scope "$scope_slug"
fi

echo "Deployment URL: $deploy_url"
curl --fail --silent --show-error --location --retry 8 --retry-delay 3 --retry-all-errors "$deploy_url" --output /tmp/3dvr-os-deploy.html
grep -q 'Daedalos' /tmp/3dvr-os-deploy.html
curl --fail --silent --show-error --location --retry 18 --retry-delay 5 --retry-all-errors "https://$project_domain/" --output /tmp/3dvr-os-domain.html
grep -q 'Daedalos' /tmp/3dvr-os-domain.html
echo "3DVR_OS_URL=https://$project_domain/"
