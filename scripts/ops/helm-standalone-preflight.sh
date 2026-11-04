#!/usr/bin/env bash
# Read-only pre-cutover gate for standalone Helm on OVH.
# Usage: bash scripts/ops/helm-standalone-preflight.sh <reviewed-ovh-ipv4>
# Does not edit DNS, Caddy, TLS, sessions, credentials, or deployment state.
set -uo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo 'usage: helm-standalone-preflight.sh <reviewed-ovh-ipv4>' >&2
  exit 64
fi
ovh_ip="$1"
helm_host='helm.3dvr.tech'
failed=0

probe() {
  local label="$1" url="$2" resolve="${3:-}" code rc
  local args=(--noproxy '*' --silent --show-error --output /dev/null
    --write-out '%{http_code}' --connect-timeout 5 --max-time 15)
  if [[ -n "$resolve" ]]; then
    args+=(--resolve "${resolve}:443:${ovh_ip}")
  fi
  code="$(curl "${args[@]}" "$url")"
  rc=$?
  if [[ "$rc" -eq 0 && "$code" == '200' ]]; then
    printf 'PASS %s http=%s curl_exit=%s\n' "$label" "$code" "$rc"
  else
    printf 'FAIL %s http=%s curl_exit=%s\n' "$label" "${code:-none}" "$rc"
    failed=1
  fi
}

# Preserve all existing entry points while preparing a separate hostname.
probe portal_root 'https://portal.3dvr.tech/'
probe portal_helm 'https://portal.3dvr.tech/helm/'
probe operator_app 'https://operator.3dvr.tech/operator/' # / redirects here with HTTP 302
probe operator_helm 'https://operator.3dvr.tech/helm/'
# Confirm that the *same reviewed OVH address* serves the existing hostnames,
# not merely that their current public DNS routes work elsewhere.
# --resolve affects this request only; strict hostname TLS verification stays on.
probe portal_root_ovh_sni 'https://portal.3dvr.tech/' portal.3dvr.tech
probe portal_helm_ovh_sni 'https://portal.3dvr.tech/helm/' portal.3dvr.tech
probe operator_app_ovh_sni 'https://operator.3dvr.tech/operator/' operator.3dvr.tech
probe operator_helm_ovh_sni 'https://operator.3dvr.tech/helm/' operator.3dvr.tech
probe standalone_helm_ovh_sni "https://${helm_host}/" "$helm_host"

if [[ "$failed" -ne 0 ]]; then
  echo 'NOT READY: keep public DNS unchanged. Fix ingress/TLS and repeat the preflight.'
  echo 'This test does not verify authentication, session isolation, or browser acceptance.'
  exit 1
fi
echo 'NETWORK PREFLIGHT PASS: still requires approved browser/auth acceptance and DNS cutover.'
