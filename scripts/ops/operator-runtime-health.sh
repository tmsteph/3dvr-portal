#!/usr/bin/env bash
set -euo pipefail

kb_value() {
  awk -v key="$1" '$1 == key ":" { print $2; exit }' /proc/meminfo
}

mem_total_kb="$(kb_value MemTotal)"
mem_available_kb="$(kb_value MemAvailable)"
swap_total_kb="$(kb_value SwapTotal)"
swap_free_kb="$(kb_value SwapFree)"
swap_used_kb=$((swap_total_kb - swap_free_kb))

browser_processes="$(ps -eo comm= 2>/dev/null | awk '$1 ~ /^(chrome|chromium|firefox)$/ { count++ } END { print count + 0 }')"
load1="$(awk '{ print $1 }' /proc/loadavg)"
cpu_count="$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc)"

printf '{'
printf '"memoryTotalMb":%d,' "$((mem_total_kb / 1024))"
printf '"memoryAvailableMb":%d,' "$((mem_available_kb / 1024))"
printf '"swapTotalMb":%d,' "$((swap_total_kb / 1024))"
printf '"swapUsedMb":%d,' "$((swap_used_kb / 1024))"
printf '"browserProcesses":%d,' "$browser_processes"
printf '"load1":%s,' "$load1"
printf '"cpuCount":%d,' "$cpu_count"
printf '"observedAt":"%s"' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '}\n'
