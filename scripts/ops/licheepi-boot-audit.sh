#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-boot-audit-result.json

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

for pair in "${SSH_A:-}:/tmp/lpi-audit-a" "${SSH_B:-}:/tmp/lpi-audit-b" "${SSH_C:-}:/tmp/lpi-audit-c"; do
  write_key "${pair%%:*}" "${pair#*:}"
done

pick_connection() {
  local host="$1"; shift
  local user key
  for user in "$@"; do
    for key in /tmp/lpi-audit-a /tmp/lpi-audit-b /tmp/lpi-audit-c; do
      [ -f "$key" ] || continue
      if ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$user@$host" true >/dev/null 2>&1; then
        printf '%s|%s\n' "$user" "$key"
        return 0
      fi
    done
  done
  return 1
}

ovh="$(pick_connection "$OVH_HOST" debian root)" || { echo '{"ok":false,"note":"Cannot reach OVH"}' > "$RESULT"; exit 1; }
OVH_USER="${ovh%%|*}"; OVH_KEY="${ovh#*|}"
O=(-i "$OVH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

# Refuse to do anything unless the known-good recovery path is healthy.
ssh "${O[@]}" "$OVH_USER@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=6 lpi4a true"

AUDIT=$(cat <<'REMOTE'
set -u
section(){ printf '\n===== %s =====\n' "$1"; }
section os-release
cat /etc/os-release 2>/dev/null || true
section uname
uname -a 2>/dev/null || true
section cmdline
cat /proc/cmdline 2>/dev/null || true
section root
findmnt -no SOURCE,FSTYPE,OPTIONS / 2>/dev/null || true
section mounts
findmnt -rno TARGET,SOURCE,FSTYPE,OPTIONS / /boot /boot/efi 2>/dev/null || true
section lsblk
lsblk -o NAME,PATH,SIZE,FSTYPE,TYPE,MOUNTPOINTS,PARTLABEL,PARTUUID,UUID 2>/dev/null || true
section fstab
cat /etc/fstab 2>/dev/null || true
section boot-files
find /boot -maxdepth 3 -type f -printf '%p\n' 2>/dev/null | sort | head -n 200 || true
section extlinux
cat /boot/extlinux/extlinux.conf 2>/dev/null || true
section uenv
cat /boot/uEnv.txt 2>/dev/null || true
section bootcmd
if command -v fw_printenv >/dev/null 2>&1; then
  fw_printenv bootcmd boot_targets bootcount bootlimit upgrade_available 2>/dev/null || true
else
  echo fw_printenv-not-installed
fi
section mtd
cat /proc/mtd 2>/dev/null || true
section partlabels
ls -l /dev/disk/by-partlabel 2>/dev/null || true
section partitions
if sudo -n true 2>/dev/null && command -v sfdisk >/dev/null 2>&1; then
  for d in /dev/mmcblk0 /dev/mmcblk1 /dev/nvme0n1; do
    [ -b "$d" ] && { echo "--- $d ---"; sudo sfdisk -d "$d" 2>/dev/null || true; }
  done
fi
section space
df -hT / /boot 2>/dev/null || true
section ssh-recovery
printf 'ssh=%s\n' "$(systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || true)"
printf 'ovh=%s/%s\n' "$(systemctl is-active lichee-tunnel.service 2>/dev/null || true)" "$(systemctl is-enabled lichee-tunnel.service 2>/dev/null || true)"
printf 'hetzner=%s/%s\n' "$(systemctl is-active 3dvr-lpi-hetzner.service 2>/dev/null || true)" "$(systemctl is-enabled 3dvr-lpi-hetzner.service 2>/dev/null || true)"
printf 'network-heal=%s/%s\n' "$(systemctl is-active 3dvr-lpi-network-heal.timer 2>/dev/null || true)" "$(systemctl is-enabled 3dvr-lpi-network-heal.timer 2>/dev/null || true)"
REMOTE
)
AUDIT_B64="$(printf '%s' "$AUDIT" | base64 -w0)"
ssh "${O[@]}" "$OVH_USER@$OVH_HOST" "printf '%s' '$AUDIT_B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a 'bash -s'" > /tmp/lpi-boot-audit.txt

RAW=/tmp/lpi-boot-audit.txt python3 - <<'PY' > "$RESULT"
import datetime, json, os, re
raw=open(os.environ['RAW'], encoding='utf-8', errors='replace').read()
sections={}
current=None
for line in raw.splitlines():
    m=re.match(r'^===== (.+) =====$', line)
    if m:
        current=m.group(1); sections[current]=[]; continue
    if current is not None: sections[current].append(line)
sections={k:'\n'.join(v).strip() for k,v in sections.items()}
osrel=sections.get('os-release','')
pretty=''
for line in osrel.splitlines():
    if line.startswith('PRETTY_NAME='):
        pretty=line.split('=',1)[1].strip().strip('"')
root=sections.get('root','').splitlines()
print(json.dumps({
  'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'ok': bool(raw.strip()),
  'osPrettyName': pretty,
  'root': root[0] if root else '',
  'cmdline': sections.get('cmdline',''),
  'sections': sections
}, indent=2))
PY
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-boot-audit-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-audit-payload.json
import json,sys
p={'message':'Record LicheePi boot audit result','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-audit-payload.json >/dev/null
fi

rm -f /tmp/lpi-audit-a /tmp/lpi-audit-b /tmp/lpi-audit-c /tmp/lpi-boot-audit.txt /tmp/lpi-audit-payload.json
