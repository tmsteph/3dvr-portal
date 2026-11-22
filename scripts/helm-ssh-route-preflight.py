#!/usr/bin/env python3
"""Read-only loopback safety gate for the Portal -> Hetzner Helm SSH route.

Only classifies the target resolved by the existing SSH configuration; it never
opens an SSH transport or authenticates a host. A non-loopback result is not
permission to restart services or replay uncertain receipts.
"""

import ipaddress
import os
import re
import subprocess
import sys

CANONICAL = "3dvr-hetzner"
HOST_PATTERN = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,252}$")


def classify(config_host, ssh_config=None, resolved_addresses=None):
    """Return a constant status; inputs injected only for unit testing."""
    host = config_host.strip() if isinstance(config_host, str) else ""
    if not host:
        host = CANONICAL
    if not HOST_PATTERN.fullmatch(host):
        return "BLOCKED_INVALID_ALIAS"
    try:
        if ssh_config is None:
            # -G prints effective configuration without making an SSH connection.
            proc = subprocess.run(
                ["ssh", "-G", host], capture_output=True, text=True,
                check=False, timeout=6,
            )
            if proc.returncode != 0:
                return "BLOCKED_SSH_CONFIG_UNAVAILABLE"
            ssh_config = proc.stdout
        params = {}
        for line in ssh_config.splitlines():
            key, sep, val = line.partition(" ")
            if sep:
                params[key.lower()] = val.strip()
        destination = params.get("hostname", "")
        if not destination or params.get("port") != "22":
            return "BLOCKED_UNRECOGNIZED_TRANSPORT"
        if params.get("proxycommand", "none").lower() != "none":
            return "BLOCKED_PROXY_REQUIRES_REVIEW"
        if params.get("proxyjump", "none").lower() != "none":
            return "BLOCKED_PROXY_REQUIRES_REVIEW"
        if resolved_addresses is None:
            # Bound DNS lookup time; do not emit the destination or any IPs.
            lookup = subprocess.run(
                ["getent", "ahosts", destination], capture_output=True, text=True,
                check=False, timeout=6,
            )
            if lookup.returncode != 0:
                return "BLOCKED_DNS_UNVERIFIED"
            resolved_addresses = [line.split()[0] for line in lookup.stdout.splitlines() if line.split()]
        if not resolved_addresses:
            return "BLOCKED_DNS_UNVERIFIED"
        addresses = [ipaddress.ip_address(value) for value in resolved_addresses]
        if any(ip.is_loopback or (isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped and ip.ipv4_mapped.is_loopback) for ip in addresses):
            return "BLOCKED_LOOPBACK_DESTINATION"
        if any(ip.is_unspecified for ip in addresses):
            return "BLOCKED_UNSPECIFIED_DESTINATION"
        # The host's identity and its relation to Hetzner are NOT yet established.
        return "NON_LOOPBACK_ONLY_IDENTITY_UNVERIFIED"
    except (subprocess.TimeoutExpired, ValueError, OSError):
        return "BLOCKED_LOOKUP_UNAVAILABLE"


def main():
    status = classify(os.getenv("THREEDVR_OPENCLAW_SSH_HOST", ""))
    print("HELM_SSH_ROUTE_PREFLIGHT=" + status)
    return 0 if status == "NON_LOOPBACK_ONLY_IDENTITY_UNVERIFIED" else 2


if __name__ == "__main__":
    sys.exit(main())
