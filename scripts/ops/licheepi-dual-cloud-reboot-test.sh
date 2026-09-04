#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-dual-reboot-result.json

write_key(){
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/lpi-b-a
write_key "${SSH_B:-}" /tmp/lpi-b-b
write_key "${SSH_C:-}" /tmp/lpi-b-c

user=''; key=''
for u in debian root; do
  for k in /tmp/lpi-b-a /tmp/lpi-b-b /tmp/lpi-b-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then
      user="$u"; key="$k"; break 2
    fi
  done
done
test -n "$user"

out="$(ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$user@$OVH_HOST" 'bash -s' <<'OVH'
set -euo pipefail
# -n is critical because this controller script itself arrives on stdin.
route(){ ssh -n -o BatchMode=yes -o ConnectTimeout=6 "$1" true >/dev/null 2>&1; }
wait_route(){ local r="$1"; for _ in $(seq 1 60); do route "$r" && return 0; sleep 3; done; return 1; }
pi(){ ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a "$@"; }

route lpi4a
route lpi4a-hetzner
DEFAULT="$(pi sh -c "grep -i '^[[:space:]]*default[[:space:]]' /boot/extlinux/extlinux.conf | head -1 | tr -s ' ' | cut -d' ' -f2")"
test "$DEFAULT" = l0
BEFORE_BTIME="$(pi awk '$1=="btime"{print $2; exit}' /proc/stat)"
KERNEL_BEFORE="$(pi uname -r)"
case "$KERNEL_BEFORE" in 5.10.113*) ;; *) exit 21;; esac
test -n "$BEFORE_BTIME"

pi sudo -n systemctl reboot >/dev/null 2>&1 || true
sleep 12
wait_route lpi4a
wait_route lpi4a-hetzner
AFTER_BTIME="$(pi awk '$1=="btime"{print $2; exit}' /proc/stat)"
KERNEL_AFTER="$(pi uname -r)"
DEFAULT_AFTER="$(pi sh -c "grep -i '^[[:space:]]*default[[:space:]]' /boot/extlinux/extlinux.conf | head -1 | tr -s ' ' | cut -d' ' -f2")"
test "$BEFORE_BTIME" != "$AFTER_BTIME"
test "$DEFAULT_AFTER" = l0
case "$KERNEL_AFTER" in 5.10.113*) ;; *) exit 22;; esac

printf 'BEFORE_BTIME=%s\nAFTER_BTIME=%s\nKERNEL_BEFORE=%s\nKERNEL_AFTER=%s\nDEFAULT_AFTER=%s\n' "$BEFORE_BTIME" "$AFTER_BTIME" "$KERNEL_BEFORE" "$KERNEL_AFTER" "$DEFAULT_AFTER"
OVH
)"

BEFORE_BTIME="$(printf '%s\n' "$out" | sed -n 's/^BEFORE_BTIME=//p')"
AFTER_BTIME="$(printf '%s\n' "$out" | sed -n 's/^AFTER_BTIME=//p')"
KERNEL_BEFORE="$(printf '%s\n' "$out" | sed -n 's/^KERNEL_BEFORE=//p')"
KERNEL_AFTER="$(printf '%s\n' "$out" | sed -n 's/^KERNEL_AFTER=//p')"
DEFAULT_AFTER="$(printf '%s\n' "$out" | sed -n 's/^DEFAULT_AFTER=//p')"
test -n "$BEFORE_BTIME" -a -n "$AFTER_BTIME" -a -n "$KERNEL_BEFORE" -a -n "$KERNEL_AFTER"

BEFORE_BTIME="$BEFORE_BTIME" AFTER_BTIME="$AFTER_BTIME" KERNEL_BEFORE="$KERNEL_BEFORE" KERNEL_AFTER="$KERNEL_AFTER" DEFAULT_AFTER="$DEFAULT_AFTER" python3 - <<'PY' > "$RESULT"
import datetime,json,os
print(json.dumps({
  'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'ok':True,
  'routesAfterReboot':{'ovh':True,'hetzner':True},
  'defaultAfter':os.environ['DEFAULT_AFTER'],
  'kernelBefore':os.environ['KERNEL_BEFORE'],
  'kernelAfter':os.environ['KERNEL_AFTER'],
  'bootTimeBefore':int(os.environ['BEFORE_BTIME']),
  'bootTimeAfter':int(os.environ['AFTER_BTIME']),
  'bootTimeChanged':os.environ['BEFORE_BTIME'] != os.environ['AFTER_BTIME']
},indent=2))
PY
cat "$RESULT"

content="$(base64 -w0 "$RESULT")"
url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-dual-cloud-reboot-result.json"
sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
python3 - "$content" "$sha" <<'PY' >/tmp/lpi-b-payload.json
import json,sys
p={'message':'Record LicheePi dual-cloud reboot test','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-b-payload.json >/dev/null
