#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-env-crc-result.json

# The live board reports U-Boot 2020.01-gd6c9182f-dirty. The exact matching
# RevyOS source commit d6c9182f6238f2fc4b386b9e4c5d2cfebbef4746 defines:
#   CONFIG_ENV_IS_IN_MMC=y
#   CONFIG_SYS_MMC_ENV_DEV=0
#   CONFIG_ENV_OFFSET=0xe0000
#   CONFIG_ENV_SIZE=0x20000
# These constants are only valid while the live U-Boot build identity matches.
EXPECTED_UBOOT_COMMIT=d6c9182f
ENV_DEVICE=/dev/mmcblk0
ENV_OFFSET_HEX=0xe0000
ENV_SIZE_HEX=0x20000

write_key() {
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then
    cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then
    :
  else
    rm -f "$dest" "$dest.raw"
    return 0
  fi
  chmod 600 "$dest"
  rm -f "$dest.raw"
}

for pair in "${SSH_A:-}:/tmp/lpi-crc-a" "${SSH_B:-}:/tmp/lpi-crc-b" "${SSH_C:-}:/tmp/lpi-crc-c"; do
  write_key "${pair%%:*}" "${pair#*:}"
done

pick() {
  local user key
  for user in debian root; do
    for key in /tmp/lpi-crc-a /tmp/lpi-crc-b /tmp/lpi-crc-c; do
      [ -f "$key" ] || continue
      if ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$user@$OVH_HOST" true >/dev/null 2>&1; then
        printf '%s|%s\n' "$user" "$key"
        return 0
      fi
    done
  done
  return 1
}

persist_result() {
  [ -n "${GITHUB_TOKEN:-}" ] || return 0
  local content url sha
  content="$(base64 -w0 "$RESULT")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-env-crc-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-crc-payload.json
import json,sys
p={'message':'Record validated LicheePi U-Boot environment layout','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-crc-payload.json >/dev/null
}

ovh="$(pick)" || {
  printf '%s\n' '{"ok":false,"reason":"OVH bootstrap unavailable; no board access attempted"}' > "$RESULT"
  cat "$RESULT"
  persist_result || true
  exit 1
}
OU="${ovh%%|*}"
OK="${ovh#*|}"
O=(-i "$OK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

if ! ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=6 lpi4a true" >/dev/null; then
  printf '%s\n' '{"ok":false,"reason":"LicheePi primary recovery path unavailable; no board read attempted"}' > "$RESULT"
  cat "$RESULT"
  persist_result || true
  exit 1
fi

REMOTE=$(cat <<'REMOTE'
set -euo pipefail
# Values below are pinned to the exact installed U-Boot source commit d6c9182f.
expected_commit=d6c9182f
env_device=/dev/mmcblk0
env_offset_hex=0xe0000
env_size_hex=0x20000
tmp=/tmp/3dvr-env.bin
boot0=/dev/mmcblk0boot0

# First prove the live bootloader identity. Never use the stored offset if this
# exact build check stops matching.
live_id="$(sudo strings "$boot0" 2>/dev/null | grep -m1 -E 'U-Boot 2020\.01-gd6c9182f' || true)"
if [ -z "$live_id" ]; then
  python3 - <<'PY'
import json
print(json.dumps({'ok':False,'reason':'live U-Boot identity no longer matches validated d6c9182f source'}))
PY
  exit 42
fi

offset=$((env_offset_hex))
size=$((env_size_hex))
# Read only the exact environment region from the eMMC user area. No writes.
sudo dd if="$env_device" of="$tmp" bs=1 skip="$offset" count="$size" status=none
sudo chmod 0644 "$tmp"

python3 - "$tmp" "$live_id" "$env_device" "$env_offset_hex" "$env_size_hex" <<'PY'
import json, struct, sys, zlib
p, live_id, device, off_hex, size_hex = sys.argv[1:]
data=open(p,'rb').read()
size=int(size_hex,16)
if len(data) != size:
    print(json.dumps({'ok':False,'reason':'short environment read','bytesRead':len(data),'expectedBytes':size}))
    raise SystemExit(43)
stored=data[:4]
calc=zlib.crc32(data[4:]) & 0xffffffff
stored_le=struct.unpack('<I',stored)[0]
raw=data[4:].split(b'\0\0',1)[0]
items={}
keys=[]
for item in raw.split(b'\0'):
    if b'=' not in item:
        continue
    k,v=item.split(b'=',1)
    try:
        key=k.decode('ascii')
    except UnicodeDecodeError:
        continue
    keys.append(key)
    if key in {'bootdelay','bootcount','bootlimit','upgrade_available','boot_partition','root_partition','mmcdev'}:
        items[key]=v.decode('utf-8','replace')[:200]
print(json.dumps({
    'ok': stored_le == calc,
    'sourceValidated': True,
    'sourceCommit': 'd6c9182f6238f2fc4b386b9e4c5d2cfebbef4746',
    'liveUboot': live_id,
    'device': device,
    'offsetHex': off_hex,
    'sizeHex': size_hex,
    'crcStoredLE': hex(stored_le),
    'crcCalculated': hex(calc),
    'crcMatches': stored_le == calc,
    'variableCount': len(keys),
    'hasBootcmd': 'bootcmd' in keys,
    'hasAltbootcmd': 'altbootcmd' in keys,
    'hasBootcount': 'bootcount' in keys,
    'hasBootlimit': 'bootlimit' in keys,
    'bootControl': items,
}, separators=(',',':')))
if stored_le != calc:
    raise SystemExit(44)
PY
rm -f "$tmp"
REMOTE
)

B64="$(printf '%s' "$REMOTE" | base64 -w0)"
set +e
ssh "${O[@]}" "$OU@$OVH_HOST" \
  "printf '%s' '$B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=10 lpi4a 'bash -s'" \
  > "$RESULT"
rc=$?
set -e

if [ ! -s "$RESULT" ]; then
  python3 - "$rc" <<'PY' > "$RESULT"
import json,sys
print(json.dumps({'ok':False,'reason':'read-only environment validation failed before producing a result','remoteExit':int(sys.argv[1])}))
PY
fi

cat "$RESULT"
persist_result || true
rm -f /tmp/lpi-crc-* /tmp/lpi-crc-payload.json

python3 - "$RESULT" <<'PY'
import json,sys
try:
    ok=bool(json.load(open(sys.argv[1])).get('ok'))
except Exception:
    ok=False
raise SystemExit(0 if ok else 1)
PY
