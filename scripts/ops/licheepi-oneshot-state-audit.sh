#!/usr/bin/env bash
set -euo pipefail
OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-oneshot-state-audit.json
NORMAL='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
ONESHOT='setenv bootcmd ${normal_bootcmd}; saveenv; run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r /extlinux/oneshot-l0.conf;'
write_key(){ local raw="$1" dest="$2"; [ -n "$raw" ] || return 0; printf '%s\n' "$raw" > "$dest.raw"; if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"; elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :; else rm -f "$dest" "$dest.raw"; return 0; fi; chmod 600 "$dest"; rm -f "$dest.raw"; }
write_key "${SSH_A:-}" /tmp/os-a; write_key "${SSH_B:-}" /tmp/os-b; write_key "${SSH_C:-}" /tmp/os-c
user=''; key=''; for u in debian root; do for k in /tmp/os-a /tmp/os-b /tmp/os-c; do [ -f "$k" ] || continue; if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then user="$u"; key="$k"; break 2; fi; done; done; test -n "$user"
O=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
REMOTE=$(cat <<'PI'
set -euo pipefail
NORMAL="$1"; ONESHOT="$2"; cfg=/tmp/3dvr-fw_env-audit.config; printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"; trap 'rm -f "$cfg"; sudo -n rm -f /tmp/3dvr-audit-env.bin' EXIT
get(){ sudo -n fw_printenv -c "$cfg" "$1" 2>/dev/null | sed -n "s/^$1=//p"; }
bootcmd="$(get bootcmd)"; helper="$(get normal_bootcmd)"; all="$(sudo -n fw_printenv -c "$cfg" 2>/dev/null)"
helper_present=false; grep -q '^normal_bootcmd=' <<<"$all" && helper_present=true
sudo -n dd if=/dev/mmcblk0 of=/tmp/3dvr-audit-env.bin bs=512 skip=1792 count=256 status=none; sudo -n chmod 0644 /tmp/3dvr-audit-env.bin
python3 - /tmp/3dvr-audit-env.bin "$bootcmd" "$helper" "$helper_present" "$NORMAL" "$ONESHOT" "$(uname -r)" "$(awk 'tolower($1)=="default"{print $2;exit}' /boot/extlinux/extlinux.conf)" "$(systemctl is-active lichee-tunnel.service)" "$(systemctl is-active 3dvr-lpi-hetzner.service)" "$(systemctl is-active 3dvr-lpi-digitalocean.service)" <<'PY'
import json,struct,sys,zlib,hashlib
p,boot,helper,hp,normal,oneshot,kernel,default,ovh,hetz,do=sys.argv[1:]
b=open(p,'rb').read(); stored=struct.unpack('<I',b[:4])[0]; calc=zlib.crc32(b[4:])&0xffffffff
state='normal' if boot==normal else ('armed-oneshot-l0' if boot==oneshot else 'unknown')
print(json.dumps({'ok':stored==calc and default=='l0','bootcmdState':state,'bootcmd':boot,'normalHelperPresent':hp=='true','normalHelperMatches':helper==normal,'crcMatches':stored==calc,'environmentSha256':hashlib.sha256(b).hexdigest(),'kernel':kernel,'extlinuxDefault':default,'services':{'ovh':ovh,'hetzner':hetz,'digitalOcean':do}},indent=2))
PY
PI
)
R64="$(printf '%s' "$REMOTE"|base64 -w0)"; N64="$(printf '%s' "$NORMAL"|base64 -w0)"; O64="$(printf '%s' "$ONESHOT"|base64 -w0)"
ssh "${O[@]}" "$user@$OVH_HOST" "N=\$(printf '%s' '$N64'|base64 -d); Q=\$(printf '%s' '$O64'|base64 -d); printf '%s' '$R64'|base64 -d|ssh -o BatchMode=yes -o ConnectTimeout=12 lpi4a 'bash -s -- \"\$N\" \"\$Q\"'" > "$RESULT"
cat "$RESULT"
if [ -n "${GITHUB_TOKEN:-}" ]; then content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-oneshot-state-audit.json"; sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null|python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha",""))' 2>/dev/null||true)"; python3 - "$content" "$sha" <<'PY' >/tmp/os-payload.json
import json,sys
p={'message':'Record LicheePi one-shot state audit','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/os-payload.json >/dev/null; fi
