#!/usr/bin/env bash
set -u

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
result=/tmp/licheepi-hardening-result.json

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

write_key "${SSH_A:-}" /tmp/lpi-key-a
write_key "${SSH_B:-}" /tmp/lpi-key-b
write_key "${SSH_C:-}" /tmp/lpi-key-c

ovh_user=''
ovh_key=''
for u in debian root; do
  for k in /tmp/lpi-key-a /tmp/lpi-key-b /tmp/lpi-key-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then
      ovh_user="$u"
      ovh_key="$k"
      break 2
    fi
  done
done

if [ -z "$ovh_user" ]; then
  echo '{"ok":false,"note":"OVH bootstrap unavailable; existing LicheePi configuration left untouched"}' > "$result"
else
  opts=(-i "$ovh_key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

  if ! ssh "${opts[@]}" "$ovh_user@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a true" >/dev/null 2>&1; then
    echo '{"ok":false,"note":"Primary lpi4a route unavailable; no Pi-side changes attempted"}' > "$result"
  else
    # Add a second OVH alias on port 2224. The working 2223 path is never modified.
    ssh "${opts[@]}" "$ovh_user@$OVH_HOST" 'bash -s' <<'OVH'
set -euo pipefail
cfg="$HOME/.ssh/config"
mkdir -p "$HOME/.ssh"
touch "$cfg"
chmod 700 "$HOME/.ssh"
chmod 600 "$cfg"
identity="$(ssh -G lpi4a 2>/dev/null | awk '$1=="identityfile"{print $2; exit}')"
[ -n "$identity" ] || identity='~/.ssh/id_ed25519_3dvr_mesh'
user="$(ssh -G lpi4a 2>/dev/null | awk '$1=="user"{print $2; exit}')"
[ -n "$user" ] || user='sipeed'
tmp="$(mktemp)"
sed '/^# BEGIN 3DVR LPI4A FALLBACK$/,/^# END 3DVR LPI4A FALLBACK$/d' "$cfg" > "$tmp"
cat >> "$tmp" <<CFG
# BEGIN 3DVR LPI4A FALLBACK
Host lpi4a-fallback
  HostName 127.0.0.1
  Port 2224
  User $user
  IdentityFile $identity
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 6
  ServerAliveInterval 20
  ServerAliveCountMax 3
# END 3DVR LPI4A FALLBACK
CFG
mv "$tmp" "$cfg"
chmod 600 "$cfg"
OVH

    cat > /tmp/lpi-pi-hardening.sh <<'PI'
#!/usr/bin/env bash
set -u
mkdir -p "$HOME/.local/bin" "$HOME/.ssh" "$HOME/.config/systemd/user"
chmod 700 "$HOME/.ssh"

# Discover a boot-safe private key that can reach OVH.
out_user=''
out_key=''
candidates=''
if ssh -G 3dvr-ovh >/dev/null 2>&1; then
  cfg_key="$(ssh -G 3dvr-ovh 2>/dev/null | awk '$1=="identityfile"{print $2; exit}')"
  cfg_key="${cfg_key/#\~/$HOME}"
  candidates="$cfg_key"
fi
candidates="$candidates $HOME/.ssh/id_ed25519_3dvr $HOME/.ssh/id_ed25519_3dvr_mesh $HOME/.ssh/id_ed25519"
for u in debian root; do
  for k in $candidates; do
    [ -s "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then
      out_user="$u"
      out_key="$k"
      break 2
    fi
  done
done

printf 'outbound_ovh=%s\n' "$([ -n "$out_key" ] && echo true || echo false)"
printf 'outbound_user=%s\n' "$out_user"
printf 'outbound_key=%s\n' "$out_key"

if [ -n "$out_key" ]; then
  cfg="$HOME/.ssh/config"
  touch "$cfg"
  chmod 600 "$cfg"
  tmp="$(mktemp)"
  sed '/^# BEGIN 3DVR LPI4A OUTBOUND FALLBACK$/,/^# END 3DVR LPI4A OUTBOUND FALLBACK$/d' "$cfg" > "$tmp"
  cat >> "$tmp" <<CFG
# BEGIN 3DVR LPI4A OUTBOUND FALLBACK
Host 3dvr-ovh-lpi-fallback
  HostName $OVH_HOST
  User $out_user
  IdentityFile $out_key
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 8
  ServerAliveInterval 20
  ServerAliveCountMax 3
# END 3DVR LPI4A OUTBOUND FALLBACK
CFG
  mv "$tmp" "$cfg"
  chmod 600 "$cfg"

  cat > "$HOME/.local/bin/3dvr-lpi-fallback-tunnel" <<'SH'
#!/usr/bin/env bash
exec ssh -N -T -o ExitOnForwardFailure=yes -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -R 127.0.0.1:2224:127.0.0.1:22 3dvr-ovh-lpi-fallback
SH
  chmod 700 "$HOME/.local/bin/3dvr-lpi-fallback-tunnel"
fi

sudo_ok=false
sudo -n true >/dev/null 2>&1 && sudo_ok=true
printf 'sudo_nopasswd=%s\n' "$sudo_ok"

# Make sure the SSH server itself is boot-enabled when privilege allows it.
if [ "$sudo_ok" = true ]; then
  if sudo systemctl cat ssh >/dev/null 2>&1; then
    sudo systemctl enable --now ssh >/dev/null 2>&1 || true
  elif sudo systemctl cat sshd >/dev/null 2>&1; then
    sudo systemctl enable --now sshd >/dev/null 2>&1 || true
  fi
fi

fallback_install='none'
if [ -n "$out_key" ]; then
  if [ "$sudo_ok" = true ]; then
    sudo tee /etc/systemd/system/3dvr-lpi-fallback.service >/dev/null <<EOF
[Unit]
Description=3DVR LicheePi redundant reverse SSH tunnel
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$(id -un)
Environment=HOME=$HOME
ExecStart=$HOME/.local/bin/3dvr-lpi-fallback-tunnel
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable --now 3dvr-lpi-fallback.service >/dev/null 2>&1 || true
    fallback_install='system'
  else
    linger="$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || true)"
    if [ "$linger" = yes ] && systemctl --user is-system-running >/dev/null 2>&1; then
      cat > "$HOME/.config/systemd/user/3dvr-lpi-fallback.service" <<EOF
[Unit]
Description=3DVR LicheePi redundant reverse SSH tunnel
After=network-online.target

[Service]
ExecStart=$HOME/.local/bin/3dvr-lpi-fallback-tunnel
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
      systemctl --user daemon-reload || true
      systemctl --user enable --now 3dvr-lpi-fallback.service >/dev/null 2>&1 || true
      fallback_install='user-systemd'
    elif command -v crontab >/dev/null 2>&1; then
      cron_line="@reboot sleep 45; while true; do $HOME/.local/bin/3dvr-lpi-fallback-tunnel; sleep 10; done"
      (crontab -l 2>/dev/null | grep -v '3dvr-lpi-fallback-tunnel' || true; printf '%s\n' "$cron_line") | crontab -
      pgrep -f '3dvr-lpi-fallback-tunnel' >/dev/null 2>&1 || nohup sh -c "while true; do '$HOME/.local/bin/3dvr-lpi-fallback-tunnel'; sleep 10; done" >"$HOME/.3dvr-lpi-fallback.log" 2>&1 &
      fallback_install='cron'
    fi
  fi
fi
printf 'fallback_install=%s\n' "$fallback_install"

# Conservative network self-heal. Only act after three consecutive failures to
# reach the OVH SSH port; this avoids flapping Wi-Fi during brief packet loss.
if [ "$sudo_ok" = true ]; then
  sudo tee /usr/local/sbin/3dvr-lpi-network-heal >/dev/null <<'SH'
#!/usr/bin/env bash
set -u
host=40.160.137.41
state=/run/3dvr-lpi-network-failures
if timeout 6 bash -c "</dev/tcp/$host/22" 2>/dev/null; then
  echo 0 > "$state"
  exit 0
fi
n="$(cat "$state" 2>/dev/null || echo 0)"
case "$n" in ''|*[!0-9]*) n=0;; esac
n=$((n+1))
echo "$n" > "$state"
[ "$n" -ge 3 ] || exit 0
if systemctl is-active --quiet NetworkManager; then
  systemctl restart NetworkManager
elif systemctl is-active --quiet systemd-networkd; then
  systemctl restart systemd-networkd
elif systemctl is-active --quiet wpa_supplicant; then
  systemctl restart wpa_supplicant
fi
echo 0 > "$state"
SH
  sudo chmod 755 /usr/local/sbin/3dvr-lpi-network-heal
  sudo tee /etc/systemd/system/3dvr-lpi-network-heal.service >/dev/null <<'EOF'
[Unit]
Description=3DVR LicheePi network self-heal check
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/3dvr-lpi-network-heal
EOF
  sudo tee /etc/systemd/system/3dvr-lpi-network-heal.timer >/dev/null <<'EOF'
[Unit]
Description=Run 3DVR LicheePi network self-heal

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
Persistent=true

[Install]
WantedBy=timers.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable --now 3dvr-lpi-network-heal.timer >/dev/null 2>&1 || true
fi

printf 'primary_process=%s\n' "$(ps -ef | grep -E '[s]sh .*2223|[m]esh-tunnel' | head -n1 | tr '\n' ' ')"
printf 'fallback_process=%s\n' "$(ps -ef | grep -E '[s]sh .*2224|[f]allback-tunnel' | head -n1 | tr '\n' ' ')"
printf 'ssh_active=%s\n' "$(systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || true)"
printf 'network_timer=%s\n' "$(systemctl is-enabled 3dvr-lpi-network-heal.timer 2>/dev/null || true)"
printf 'ips=%s\n' "$(hostname -I 2>/dev/null)"
PI
    chmod +x /tmp/lpi-pi-hardening.sh

    ssh "${opts[@]}" "$ovh_user@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a 'OVH_HOST=$OVH_HOST bash -s'" < /tmp/lpi-pi-hardening.sh > /tmp/lpi-pi-hardening.txt 2>&1 || true

    fallback=false
    for _ in 1 2 3 4 5 6 7 8; do
      if ssh "${opts[@]}" "$ovh_user@$OVH_HOST" "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 lpi4a-fallback true" >/dev/null 2>&1; then
        fallback=true
        break
      fi
      sleep 2
    done

    primary=false
    ssh "${opts[@]}" "$ovh_user@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=5 lpi4a true" >/dev/null 2>&1 && primary=true

    DETAILS="$(cat /tmp/lpi-pi-hardening.txt)" PRIMARY="$primary" FALLBACK="$fallback" python3 - <<'PY' > "$result"
import json, os, datetime
raw=os.environ.get('DETAILS','')
kv={}
for line in raw.splitlines():
    if '=' in line:
        k,v=line.split('=',1)
        kv[k]=v
print(json.dumps({
  'ok': os.environ.get('PRIMARY') == 'true',
  'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'primaryPort2223': os.environ.get('PRIMARY') == 'true',
  'fallbackPort2224': os.environ.get('FALLBACK') == 'true',
  'pi': kv,
  'raw': raw
}, indent=2))
PY
  fi
fi

cat "$result"

# Persist a sanitized receipt when running in GitHub Actions.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$result")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-hardening-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-payload.json
import json,sys
p={'message':'Record LicheePi hardening result','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-payload.json >/dev/null
fi

rm -f /tmp/lpi-key-* /tmp/lpi-pi-hardening.sh /tmp/lpi-payload.json
