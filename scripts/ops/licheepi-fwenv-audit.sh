#!/usr/bin/env bash
set -euo pipefail
OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-fwenv-audit-result.json
write_key(){ local raw="$1" dest="$2"; [ -n "$raw" ] || return 0; printf '%s\n' "$raw" > "$dest.raw"; if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"; elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :; else rm -f "$dest" "$dest.raw"; return 0; fi; chmod 600 "$dest"; rm -f "$dest.raw"; }
for pair in "${SSH_A:-}:/tmp/lpi-env-a" "${SSH_B:-}:/tmp/lpi-env-b" "${SSH_C:-}:/tmp/lpi-env-c"; do write_key "${pair%%:*}" "${pair#*:}"; done
pick(){ local user key; for user in debian root; do for key in /tmp/lpi-env-a /tmp/lpi-env-b /tmp/lpi-env-c; do [ -f "$key" ] || continue; ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$user@$OVH_HOST" true >/dev/null 2>&1 && { printf '%s|%s\n' "$user" "$key"; return; }; done; done; return 1; }
ovh="$(pick)" || exit 1; OU="${ovh%%|*}"; OK="${ovh#*|}"; O=(-i "$OK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=6 lpi4a true"
PROBE=$(cat <<'REMOTE'
set -u
printf 'FW_ENV_CONFIG='; if [ -f /etc/fw_env.config ]; then tr '\n' ';' </etc/fw_env.config; fi; printf '\n'
printf 'DT_ENV='; for f in /proc/device-tree/config/u-boot,mmc-env-*; do [ -f "$f" ] || continue; printf '%s:' "$(basename "$f")"; od -An -tx1 "$f" 2>/dev/null | tr -d ' \n'; printf ';'; done; printf '\n'
scan(){ dev="$1" mode="$2"; [ -b "$dev" ] || return 0; if [ "$mode" = head ]; then sudo dd if="$dev" bs=1M count=64 status=none 2>/dev/null; else bytes="$(sudo blockdev --getsize64 "$dev" 2>/dev/null || echo 0)"; [ "$bytes" -gt 67108864 ] || return 0; skip=$((bytes/1048576-64)); sudo dd if="$dev" bs=1M skip="$skip" count=64 status=none 2>/dev/null; fi | strings -td 2>/dev/null | grep -E 'boot(cmd|delay|count|limit)=|altbootcmd=|upgrade_available=|boot_targets=|distro_bootcmd=|set_bootargs=' | head -n 80 | tr '\n' ';'; }
printf 'MMC0_HEAD_ENVSTRINGS=%s\n' "$(scan /dev/mmcblk0 head || true)"
printf 'MMC0_TAIL_ENVSTRINGS=%s\n' "$(scan /dev/mmcblk0 tail || true)"
printf 'BOOT0_ENVSTRINGS=%s\n' "$(scan /dev/mmcblk0boot0 head || true)"
printf 'BOOT1_ENVSTRINGS=%s\n' "$(scan /dev/mmcblk0boot1 head || true)"
REMOTE
)
B64="$(printf '%s' "$PROBE" | base64 -w0)"
ssh "${O[@]}" "$OU@$OVH_HOST" "printf '%s' '$B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=12 lpi4a 'bash -s'" > /tmp/lpi-env.txt
RAW=/tmp/lpi-env.txt python3 - <<'PY' > "$RESULT"
import datetime,json,os
kv={}
for line in open(os.environ['RAW'],encoding='utf-8',errors='replace'):
    line=line.rstrip('\n')
    if '=' in line:
        k,v=line.split('=',1); kv[k]=v
print(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ok':bool(kv),'environment':kv},indent=2))
PY
cat "$RESULT"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-fwenv-audit-result.json"; sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-env-payload.json
import json,sys
p={'message':'Record LicheePi U-Boot environment audit','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-env-payload.json >/dev/null
fi
rm -f /tmp/lpi-env-* /tmp/lpi-env.txt
