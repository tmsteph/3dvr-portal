#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-mainline-preflight-result.json

write_key() {
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
for pair in "${SSH_A:-}:/tmp/lpi-pre-a" "${SSH_B:-}:/tmp/lpi-pre-b" "${SSH_C:-}:/tmp/lpi-pre-c"; do write_key "${pair%%:*}" "${pair#*:}"; done

user=''; key=''
for u in debian root; do
  for k in /tmp/lpi-pre-a /tmp/lpi-pre-b /tmp/lpi-pre-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then user="$u"; key="$k"; break 2; fi
  done
done
[ -n "$user" ] || { echo '{"ok":false,"reason":"OVH unavailable"}' > "$RESULT"; exit 1; }
opts=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

REMOTE=$(cat <<'REMOTE'
set -euo pipefail
python3 - <<'PY'
import json,re,subprocess
from pathlib import Path

def sh(cmd):
    p=subprocess.run(cmd,shell=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    return p.returncode,p.stdout.strip()

def cfg_value(path,key):
    if not path.exists(): return None
    for line in path.read_text(errors='replace').splitlines():
        if line.startswith(key+'='): return line.split('=',1)[1]
        if line.strip()==f'# {key} is not set': return 'n'
    return None

def enabled(v): return v not in (None,'n')

def section(text,label):
    out=[]; active=False
    for line in text.splitlines():
        m=re.match(r'^\s*label\s+(\S+)',line,re.I)
        if m:
            if active and m.group(1)!=label: break
            active=(m.group(1)==label)
        if active: out.append(line)
    return '\n'.join(out)

def val(sec,key):
    m=re.search(r'^\s*'+re.escape(key)+r'\s+(.+?)\s*$',sec,re.M|re.I)
    return m.group(1).strip() if m else ''

def full(p): return str(Path('/boot')/p.lstrip('/')) if p else ''

def info(p):
    q=Path(p); return {'path':str(q),'exists':q.exists(),'bytes':q.stat().st_size if q.exists() else 0}

def find_names(root,terms,limit=80):
    root=Path(root); out=[]
    if not root.exists(): return out
    for p in root.rglob('*'):
        s=str(p).lower()
        if any(t in s for t in terms):
            out.append(str(p))
            if len(out)>=limit: break
    return out

ext=Path('/boot/extlinux/extlinux.conf')
text=ext.read_text(errors='replace') if ext.exists() else ''
default=(re.search(r'^\s*default\s+(\S+)',text,re.M|re.I) or [None,''])[1]
main=section(text,'mainline71'); vendor=section(text,'l0'); rescue=section(text,'l0r')
kernel=full(val(main,'linux')); initrd=full(val(main,'initrd')); dtb=full(val(main,'fdt')); append=val(main,'append')
release=(re.search(r'vmlinux-(.+)$',kernel) or [None,'7.1.12+deb14-riscv64'])[1]
config=Path('/boot')/f'config-{release}'; modules=Path('/lib/modules')/release

# sudo blkid works on this board whereas unprivileged blkid can return empty.
root_uuid=sh("sudo -n blkid -s UUID -o value /dev/mmcblk0p3 2>/dev/null || lsblk -no UUID /dev/mmcblk0p3 2>/dev/null")[1].splitlines()[0].strip() if sh("sudo -n blkid -s UUID -o value /dev/mmcblk0p3 2>/dev/null || lsblk -no UUID /dev/mmcblk0p3 2>/dev/null")[1].strip() else ''
root_arg=(re.search(r'\broot=(\S+)',append) or [None,''])[1]
root_match=bool(root_uuid and root_arg==f'UUID={root_uuid}')

critical_cfg={k:cfg_value(config,k) for k in ['CONFIG_EXT4_FS','CONFIG_MMC','CONFIG_MMC_BLOCK','CONFIG_BLK_DEV_INITRD']}
feature_cfg={k:cfg_value(config,k) for k in ['CONFIG_DRM','CONFIG_DRM_POWERVR','CONFIG_CMA','CONFIG_DMA_CMA','CONFIG_CMA_SIZE_MBYTES','CONFIG_WATCHDOG','CONFIG_SOFT_WATCHDOG','CONFIG_DW_WATCHDOG','CONFIG_CFG80211','CONFIG_MAC80211','CONFIG_WLAN']}

rc,initrd_listing=sh(f"command -v lsinitramfs >/dev/null && lsinitramfs {initrd!r} 2>/dev/null || true")
low=initrd_listing.lower()
initrd_requirements={
 'ext4': 'ext4.ko' in low,
 'mmc_core': 'mmc_core.ko' in low,
 'mmc_block': 'mmc_block.ko' in low,
 'sdhci_family': ('sdhci-of-dwcmshc.ko' in low or 'dw_mmc' in low or 'sdhci.ko' in low),
}
module_matches=find_names(modules,['aic8800','aic8801','powervr','th1520-dw-hdmi','verisilicon-dc'],80)
aic_modules=all((modules/'updates/aic8800'/x).exists() for x in ['aic8800_bsp.ko','aic8800_fdrv.ko'])
aic_firmware=Path('/lib/firmware/aic8800').exists() and any(Path('/lib/firmware/aic8800').iterdir())
powervr=any('imagination/powervr.ko' in p for p in module_matches) or enabled(feature_cfg['CONFIG_DRM_POWERVR'])
hdmi=any('th1520-dw-hdmi' in p for p in module_matches)
verisilicon=any('verisilicon-dc' in p for p in module_matches)

# DTB strings are a coarse sanity check only; filename/device-tree compilation
# may not preserve every label string.
rc,dtb_strings=sh(f"strings {dtb!r} 2>/dev/null || true")
dtb_low=dtb_strings.lower()
dtb_evidence={
 'th1520_gpu': ('thead,th1520-gpu' in dtb_low or 'gpu@ffef400000' in dtb_low),
 'th1520_hdmi': ('thead,th1520-dw-hdmi' in dtb_low or 'hdmi@ffef540000' in dtb_low),
 'display': 'display@ffef600000' in dtb_low,
}

warnings=[]
if feature_cfg['CONFIG_DW_WATCHDOG']=='n': warnings.append('candidate kernel does not enable DW hardware watchdog; do not rely on watchdog recovery for the first mainline boot')
if enabled(feature_cfg['CONFIG_CMA']) and 'cma=' not in append: warnings.append(f"mainline71 uses kernel CMA default ({feature_cfg.get('CONFIG_CMA_SIZE_MBYTES')} MiB); validate GPU/display before promotion")
if not aic_modules: warnings.append('AIC8800 bridge modules are not both present in candidate modules tree')
if not aic_firmware: warnings.append('AIC8800 firmware directory is missing or empty')
if not powervr: warnings.append('PowerVR candidate driver not evident')
if not hdmi: warnings.append('TH1520 HDMI bridge module not evident')
if not verisilicon: warnings.append('Verisilicon display controller module not evident')

files=[info(x) for x in [kernel,initrd,dtb]]
critical_ok=(
 default=='l0' and bool(vendor) and bool(rescue) and bool(main)
 and all(x['exists'] and x['bytes']>0 for x in files)
 and root_match and modules.exists()
 and all(enabled(v) for v in critical_cfg.values())
 and all(initrd_requirements.values())
)

print(json.dumps({
 'ok':critical_ok,
 'safeDefault':default,
 'candidateRelease':release,
 'rootUuid':root_uuid,
 'candidateRootArg':root_arg,
 'rootMatches':root_match,
 'requiredFiles':files,
 'criticalConfig':critical_cfg,
 'initramfsRootRequirements':initrd_requirements,
 'featureConfig':feature_cfg,
 'aicModulesPresent':aic_modules,
 'aicFirmwarePresent':aic_firmware,
 'powerVrPresent':powervr,
 'th1520HdmiPresent':hdmi,
 'verisiliconDisplayPresent':verisilicon,
 'dtbEvidence':dtb_evidence,
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
  content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-mainline-preflight-result.json"
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
python3 - "$RESULT" <<'PY'
import json,sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('ok') else 1)
PY
