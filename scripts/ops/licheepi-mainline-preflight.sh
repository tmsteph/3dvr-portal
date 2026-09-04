#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-mainline-preflight-result.json

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

for pair in "${SSH_A:-}:/tmp/lpi-pre-a" "${SSH_B:-}:/tmp/lpi-pre-b" "${SSH_C:-}:/tmp/lpi-pre-c"; do
  write_key "${pair%%:*}" "${pair#*:}"
done

user=''; key=''
for u in debian root; do
  for k in /tmp/lpi-pre-a /tmp/lpi-pre-b /tmp/lpi-pre-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then
      user="$u"; key="$k"; break 2
    fi
  done
done
[ -n "$user" ] || { echo '{"ok":false,"reason":"OVH unavailable"}' > "$RESULT"; exit 1; }
opts=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

REMOTE=$(cat <<'REMOTE'
set -euo pipefail
python3 - <<'PY'
import json, os, re, subprocess
from pathlib import Path

boot=Path('/boot')
extlinux=boot/'extlinux/extlinux.conf'
text=extlinux.read_text(errors='replace') if extlinux.exists() else ''

def sh(cmd):
    p=subprocess.run(cmd,shell=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    return p.returncode,p.stdout.strip()

def section(label):
    lines=text.splitlines(); out=[]; active=False
    for line in lines:
        if re.match(r'^\s*label\s+',line,re.I):
            name=re.split(r'\s+',line.strip(),maxsplit=1)[1] if len(line.strip().split(None,1))>1 else ''
            if active and name != label: break
            active=(name==label)
        if active: out.append(line)
    return '\n'.join(out)

def val(sec,key):
    m=re.search(r'^\s*'+re.escape(key)+r'\s+(.+?)\s*$',sec,re.M|re.I)
    return m.group(1).strip() if m else ''

def cfg_value(cfg,key):
    if not cfg.exists(): return None
    for line in cfg.read_text(errors='replace').splitlines():
        if line.startswith(key+'='): return line.split('=',1)[1]
        if line.strip()==f'# {key} is not set': return 'n'
    return None

def enabled(v): return v not in (None,'n')

def file_info(path):
    p=Path(path)
    return {'path':str(p),'exists':p.exists(),'bytes':p.stat().st_size if p.exists() else 0}

def find_matches(root, patterns, limit=80):
    root=Path(root); found=[]
    if not root.exists(): return found
    pats=[p.lower() for p in patterns]
    try:
        for p in root.rglob('*'):
            s=str(p).lower()
            if any(x in s for x in pats):
                found.append(str(p))
                if len(found)>=limit: break
    except PermissionError:
        pass
    return found

def strings_matches(path, terms):
    if not Path(path).exists(): return []
    rc,out=sh(f"strings {str(path)!r} 2>/dev/null")
    lowterms=[x.lower() for x in terms]; result=[]
    for line in out.splitlines():
        low=line.lower()
        if any(x in low for x in lowterms):
            result.append(line[:300])
            if len(result)>=80: break
    return result

m=re.search(r'^\s*default\s+(\S+)',text,re.M|re.I)
default=m.group(1) if m else ''
main=section('mainline71')
vendor=section('l0')
rescue=section('l0r')
linux_path=val(main,'linux')
initrd_path=val(main,'initrd')
fdt_path=val(main,'fdt')
append=val(main,'append')

def full(p): return str(boot/p.lstrip('/')) if p else ''

kernel=full(linux_path); initrd=full(initrd_path); dtb=full(fdt_path)
# infer candidate release from vmlinux name
km=re.search(r'vmlinux-(.+)$',kernel)
release=km.group(1) if km else '7.1.12+deb14-riscv64'
cfg=boot/f'config-{release}'
modules=Path('/lib/modules')/release

root_uuid=sh("blkid -s UUID -o value /dev/mmcblk0p3 2>/dev/null")[1]
root_arg=''
rm=re.search(r'\broot=(\S+)',append)
if rm: root_arg=rm.group(1)
root_match=(root_arg==f'UUID={root_uuid}') if root_uuid and root_arg.startswith('UUID=') else False

critical_cfg={k:cfg_value(cfg,k) for k in [
 'CONFIG_EXT4_FS','CONFIG_MMC','CONFIG_MMC_BLOCK','CONFIG_MMC_SDHCI',
 'CONFIG_DEVTMPFS','CONFIG_DEVTMPFS_MOUNT','CONFIG_BLK_DEV_INITRD'
]}
feature_cfg={k:cfg_value(cfg,k) for k in [
 'CONFIG_DRM','CONFIG_DRM_POWERVR','CONFIG_DRM_SIMPLEDRM','CONFIG_DRM_PANEL',
 'CONFIG_CMA','CONFIG_DMA_CMA','CONFIG_CMA_SIZE_MBYTES','CONFIG_CMA_SIZE_PERCENTAGE',
 'CONFIG_WATCHDOG','CONFIG_SOFT_WATCHDOG','CONFIG_DW_WATCHDOG',
 'CONFIG_CFG80211','CONFIG_MAC80211','CONFIG_WLAN'
]}

module_matches=find_matches(modules,['aic','8800','8801','powervr','pvr','drm','sdhci','mmc'],120)
firmware_matches=find_matches('/lib/firmware/aic8800',[''],120) if Path('/lib/firmware/aic8800').exists() else []
# The helper with [''] intentionally lists up to 120 files when the AIC firmware directory exists.
initrd_matches=[]
if Path(initrd).exists():
    rc,out=sh(f"command -v lsinitramfs >/dev/null && lsinitramfs {initrd!r} 2>/dev/null || true")
    for line in out.splitlines():
        lo=line.lower()
        if any(t in lo for t in ['aic','8800','8801','powervr','pvr','ext4','mmc','sdhci']):
            initrd_matches.append(line[:300])
            if len(initrd_matches)>=120: break

dtb_matches=strings_matches(dtb,['aic8801','aic8800','gpu','powervr','display','hdmi','dsi','ethernet','pcie','usb'])

warnings=[]
if default!='l0': warnings.append('extlinux default is not known-good l0')
if not vendor: warnings.append('vendor l0 entry missing')
if not rescue: warnings.append('vendor rescue l0r entry missing')
if not main: warnings.append('mainline71 entry missing')
if not root_match: warnings.append('mainline root= does not match current root filesystem UUID')
if not modules.exists(): warnings.append('candidate /lib/modules tree missing')
if not any('aic' in p.lower() for p in module_matches): warnings.append('no AIC8800/AIC8801 candidate-kernel module found under /lib/modules')
if not Path('/lib/firmware/aic8800').exists(): warnings.append('AIC firmware directory missing')
if not enabled(feature_cfg.get('CONFIG_DRM_POWERVR')) and not any('powervr' in p.lower() or '/pvr' in p.lower() for p in module_matches): warnings.append('PowerVR driver not evident in candidate config/modules')
if enabled(feature_cfg.get('CONFIG_CMA')) and 'cma=' not in append:
    warnings.append('candidate uses kernel/default CMA sizing; no explicit cma= override in mainline71')

required_files=[file_info(x) for x in [kernel,initrd,dtb]]
critical_ok=(default=='l0' and bool(vendor) and bool(rescue) and bool(main) and all(x['exists'] and x['bytes']>0 for x in required_files) and root_match and modules.exists() and all(enabled(v) for v in critical_cfg.values()))

print(json.dumps({
 'ok':critical_ok,
 'safeDefault':default,
 'candidateRelease':release,
 'rootUuid':root_uuid,
 'candidateRootArg':root_arg,
 'rootMatches':root_match,
 'requiredFiles':required_files,
 'criticalConfig':critical_cfg,
 'featureConfig':feature_cfg,
 'candidateModulesDir':str(modules),
 'moduleMatches':module_matches,
 'aicFirmwareFileCount':len(firmware_matches),
 'initramfsMatches':initrd_matches,
 'dtbEvidence':dtb_matches,
 'candidateAppend':append,
 'vendorEntryPresent':bool(vendor),
 'rescueEntryPresent':bool(rescue),
 'mainlineEntryPresent':bool(main),
 'warnings':warnings,
},indent=2))
PY
REMOTE
)
B64="$(printf '%s' "$REMOTE" | base64 -w0)"
ssh "${opts[@]}" "$user@$OVH_HOST" "printf '%s' '$B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=12 lpi4a 'bash -s'" > "$RESULT"
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-mainline-preflight-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-pre-payload.json
import json,sys
p={'message':'Record LicheePi mainline preflight','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-pre-payload.json >/dev/null
fi

rm -f /tmp/lpi-pre-* /tmp/lpi-pre-payload.json
# Warnings are expected during development. Fail only when a critical boot prerequisite is absent.
python3 - "$RESULT" <<'PY'
import json,sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('ok') else 1)
PY
