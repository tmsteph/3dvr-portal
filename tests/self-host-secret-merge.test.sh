#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
merge_script="$repo_root/scripts/ops/merge-env-updates.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

destination="$tmp/portal-secrets.env"
updates="$tmp/updates.env"

cat > "$destination" <<'ENV'
# keep comments too
KEEP_ME=keep
OPENAI_API_KEY=old
SPECIAL=$'line1\nline2'
ENV

cat > "$updates" <<'ENV'
OPENAI_API_KEY=new\ value\ with\ spaces
GMAIL_APP_PASSWORD=$'line1\nline2!$'
ENV

bash "$merge_script" "$destination" "$updates"
set -a
. "$destination"
set +a
[ "$KEEP_ME" = keep ]
[ "$OPENAI_API_KEY" = 'new value with spaces' ]
[ "$GMAIL_APP_PASSWORD" = $'line1\nline2!$' ]
[ "$SPECIAL" = $'line1\nline2' ]
[ "$(grep -c '^OPENAI_API_KEY=' "$destination")" -eq 1 ]
grep -Fq '# keep comments too' "$destination"

cp "$destination" "$tmp/before-empty"
: > "$updates"
bash "$merge_script" "$destination" "$updates"
cmp -s "$tmp/before-empty" "$destination"

echo 'self-host secret merge: ok'
