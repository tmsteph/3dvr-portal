#!/usr/bin/env bash
set -euo pipefail
OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-env-crc-result.json
write_key(){ local raw="$1" dest="$2"; [ -n "$raw" ] || return 0; printf '%s\n' "$raw" > "$dest.raw"; if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"; elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :; else rm -f "$dest" "$dest.raw"; return 0; fi; chmod 600 "$dest"; rm -f "$dest.raw"; }
for pair in "${SSH_A:-}:/tmp/lpi-crc-a" "${SSH_B:-}:/tmp/lpi-crc-b" "${SSH_C:-}:/tmp/lpi-crc-c"; do write_key "${pair%%:*}" "${pair#*:}"; done
pick(){ local user key; for user in debian root; do for key in /tmp/lpi-crc-a /tmp/lpi-crc-b /tmp/lpi-crc-c; do [ -f "$key" ] || continue; ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$user@$OVH_HOST" true >/dev/null 2>&1 && { printf '%s|%s\n' "$user" "$key"; return; }; done; done; return 1; }
ovh="$(pick)" || exit 1; OU="${ovh%%|*}"; OK="${ovh#*|}"; O=(-i "$OK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=6 lpi4a true"
REMOTE=$(cat <<'REMOTE'
set -euo pipefail
tmp=/tmp/3dvr-env.bin
sudo dd if=/dev/mmcblk0 of="$tmp" bs=512 skip=1792 count=1024 status=none
python3 - "$tmp" <<'PY'
import json,struct,sys,zlib
p=sys.argv[1]; data=open(p,'rb').read(); stored=data[:4]
candidates=[]
for size in (0x1000,0x2000,0x4000,0x8000,0x10000,0x20000,0x40000,0x80000):
    if size>len(data): continue
    crc=zlib.crc32(data[4:size]) & 0xffffffff
    candidates.append({'sizeHex':hex(size),'size':size,'crcHex':hex(crc),'matchesLE':stored==struct.pack('<I',crc),'matchesBE':stored==struct.pack('>I',crc)})
print(json.dumps({'offsetHex':'0xe0000','offset':0xe0000,'storedCrcHex':stored.hex(),'candidates':candidates},separators=(',',':')))
PY
rm -f "$tmp"
REMOTE
)
B64="$(printf '%s' "$REMOTE" | base64 -w0)"
ssh "${O[@]}" "$OU@$OVH_HOST" "printf '%s' '$B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=10 lpi4a 'bash -s'" > "$RESULT"
cat "$RESULT"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-env-crc-result.json"; sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-crc-payload.json
import json,sys
p={'message':'Record LicheePi U-Boot environment CRC result','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-crc-payload.json >/dev/null
fi
rm -f /tmp/lpi-crc-* /tmp/lpi-crc-payload.json
