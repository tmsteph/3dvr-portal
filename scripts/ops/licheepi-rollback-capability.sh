#!/usr/bin/env bash
set -euo pipefail
OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-rollback-capability-result.json
write_key(){ local raw="$1" dest="$2"; [ -n "$raw" ] || return 0; printf '%s\n' "$raw" > "$dest.raw"; if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"; elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :; else rm -f "$dest" "$dest.raw"; return 0; fi; chmod 600 "$dest"; rm -f "$dest.raw"; }
for pair in "${SSH_A:-}:/tmp/lpi-cap-a" "${SSH_B:-}:/tmp/lpi-cap-b" "${SSH_C:-}:/tmp/lpi-cap-c"; do write_key "${pair%%:*}" "${pair#*:}"; done
pick(){ local user key; for user in debian root; do for key in /tmp/lpi-cap-a /tmp/lpi-cap-b /tmp/lpi-cap-c; do [ -f "$key" ] || continue; ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$user@$OVH_HOST" true >/dev/null 2>&1 && { printf '%s|%s\n' "$user" "$key"; return; }; done; done; return 1; }
ovh="$(pick)" || exit 1; OU="${ovh%%|*}"; OK="${ovh#*|}"; O=(-i "$OK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=6 lpi4a true"
PROBE=$(cat <<'REMOTE'
set -u
printf 'KEXEC_COMMAND=%s\n' "$(command -v kexec 2>/dev/null || true)"
printf 'WATCHDOG_DEVICES=%s\n' "$(ls /dev/watchdog* 2>/dev/null | tr '\n' ' ' || true)"
printf 'WATCHDOG_SYSFS=%s\n' "$(find /sys/class/watchdog -maxdepth 2 -type f \( -name identity -o -name timeout -o -name status \) -print -exec cat {} \; 2>/dev/null | tr '\n' '|' || true)"
printf 'VENDOR_CONFIG=%s\n' "$(grep -E '^(CONFIG_KEXEC|CONFIG_WATCHDOG|CONFIG_SOFT_WATCHDOG|CONFIG_DW_WATCHDOG|CONFIG_THEAD.*WATCHDOG)=' /boot/config-5.10.113-lpi4a 2>/dev/null | tr '\n' ';' || true)"
printf 'MAINLINE_CONFIG=%s\n' "$(grep -E '^(CONFIG_KEXEC|CONFIG_KEXEC_FILE|CONFIG_WATCHDOG|CONFIG_SOFT_WATCHDOG|CONFIG_DW_WATCHDOG|CONFIG_THEAD.*WATCHDOG)=' /boot/config-7.1.12+deb14-riscv64 2>/dev/null | tr '\n' ';' || true)"
printf 'WDCTL=%s\n' "$(command -v wdctl 2>/dev/null || true)"
if command -v wdctl >/dev/null 2>&1; then printf 'WDCTL_OUT=%s\n' "$(wdctl 2>/dev/null | tr '\n' ';' || true)"; fi
if sudo -n true 2>/dev/null; then
  for dev in /dev/mmcblk0 /dev/mmcblk0boot0 /dev/mmcblk0boot1; do
    [ -b "$dev" ] || continue
    hits="$(sudo dd if="$dev" bs=1M count=8 status=none 2>/dev/null | strings 2>/dev/null | grep -Ei 'U-Boot|bootcount|bootlimit|altbootcmd|upgrade_available' | head -n 40 | tr '\n' ';' || true)"
    printf 'BOOTSTRINGS_%s=%s\n' "$(basename "$dev")" "$hits"
  done
fi
REMOTE
)
B64="$(printf '%s' "$PROBE" | base64 -w0)"
ssh "${O[@]}" "$OU@$OVH_HOST" "printf '%s' '$B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a 'bash -s'" > /tmp/lpi-cap.txt
RAW=/tmp/lpi-cap.txt python3 - <<'PY' > "$RESULT"
import datetime,json,os
kv={}
for line in open(os.environ['RAW'],encoding='utf-8',errors='replace'):
    line=line.rstrip('\n')
    if '=' in line:
        k,v=line.split('=',1); kv[k]=v
print(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ok':bool(kv),'capabilities':kv},indent=2))
PY
cat "$RESULT"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-rollback-capability-result.json"; sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-cap-payload.json
import json,sys
p={'message':'Record LicheePi rollback capability result','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-cap-payload.json >/dev/null
fi
rm -f /tmp/lpi-cap-* /tmp/lpi-cap.txt
