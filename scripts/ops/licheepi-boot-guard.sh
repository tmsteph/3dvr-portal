#!/usr/bin/env bash
set -euo pipefail

conf=/boot/extlinux/extlinux.conf
fail=0
check(){ if eval "$2"; then printf 'PASS %s\n' "$1"; else printf 'FAIL %s\n' "$1"; fail=1; fi; }

check 'extlinux exists' '[ -f "$conf" ]'
check 'vendor remains default' "grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' '$conf'"
check 'vendor l0 entry exists' "grep -Eq '^[[:space:]]*label[[:space:]]+l0([[:space:]]|$)' '$conf'"
check 'vendor rescue l0r exists' "grep -Eq '^[[:space:]]*label[[:space:]]+l0r([[:space:]]|$)' '$conf'"
check 'mainline is separate test entry' "grep -Eq '^[[:space:]]*label[[:space:]]+mainline71([[:space:]]|$)' '$conf'"
check 'vendor Image exists' '[ -s /boot/Image ]'
check 'vendor rescue kernel exists' '[ -s /boot/vmlinux-5.10.113-lpi4a ]'
check 'mainline kernel exists' '[ -s /boot/vmlinux-7.1.12+deb14-riscv64 ]'
check 'mainline initrd exists' '[ -s /boot/initrd.img-7.1.12+deb14-riscv64 ]'
check 'ssh active' 'systemctl is-active --quiet ssh || systemctl is-active --quiet sshd'
check 'OVH tunnel enabled' 'systemctl is-enabled --quiet lichee-tunnel.service'
check 'OVH tunnel active' 'systemctl is-active --quiet lichee-tunnel.service'
check 'Hetzner tunnel enabled' 'systemctl is-enabled --quiet 3dvr-lpi-hetzner.service'
check 'Hetzner tunnel active' 'systemctl is-active --quiet 3dvr-lpi-hetzner.service'
check 'DigitalOcean tunnel enabled' 'systemctl is-enabled --quiet 3dvr-lpi-digitalocean.service'
check 'DigitalOcean tunnel active' 'systemctl is-active --quiet 3dvr-lpi-digitalocean.service'
check 'network heal enabled' 'systemctl is-enabled --quiet 3dvr-lpi-network-heal.timer'

exit "$fail"
