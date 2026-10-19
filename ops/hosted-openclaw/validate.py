#!/usr/bin/env python3
"""Dependency-free guardrails for the non-production Compose reference."""
from pathlib import Path

compose = (Path(__file__).parent / "compose.yaml").read_text()
required = (
    'read_only: true',
    'no-new-privileges:true',
    'pids_limit:',
    'mem_limit:',
    'cpus:',
    'internal: true',
    'restart: "no"',
    'cap_drop:',
    '- ALL',
    'OPENCLAW_IMAGE:?',
)
for marker in required:
    assert marker in compose, f"Missing guardrail: {marker}"
for forbidden in ("privileged: true", "/var/run/docker.sock", "network_mode: host", "ports:", "pid: host"):
    assert forbidden not in compose, f"Unsafe setting: {forbidden}"
assert compose.count("    image:") == 1, "Expected exactly one isolated tenant service"
print("PASS: static Docker pilot guardrails")
