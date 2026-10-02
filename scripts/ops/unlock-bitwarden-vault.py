#!/usr/bin/env python3
"""Owner-only terminal handoff. Master password is never saved."""
import getpass
import json
import os
import subprocess
import sys
from pathlib import Path

if os.geteuid() != 0 or not sys.stdin.isatty():
    sys.exit("Run with sudo in the OVH server terminal.")
profile = Path("/var/lib/3dvr/bitwarden-vault-cli")
profile.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(profile, 0o700)
env = dict(os.environ, BITWARDENCLI_APPDATA_DIR=str(profile))
binary = "/home/debian/.local/bin/bw"
status = subprocess.run([binary, "status"], env=env, capture_output=True, text=True)
if status.returncode:
    sys.exit("Bitwarden status check failed.")
logged_in = json.loads(status.stdout).get("status") != "unauthenticated"
email = "" if logged_in else input("Bitwarden email: ").strip()
env["OWNER_VAULT_PASSWORD"] = getpass.getpass("Bitwarden master password (not saved): ")
args = [binary, "unlock"] if logged_in else [binary, "login", email]
# MFA is prompted by Bitwarden on the terminal when required.
result = subprocess.run(args + ["--passwordenv", "OWNER_VAULT_PASSWORD", "--raw"],
                        env=env, stdout=subprocess.PIPE, text=True)
env.pop("OWNER_VAULT_PASSWORD", None)
if result.returncode or not result.stdout.strip():
    sys.exit("Bitwarden unlock failed; no session saved.")
session = result.stdout.strip()
env["BW_SESSION"] = session
check = subprocess.run([binary, "status"], env=env, capture_output=True, text=True)
if check.returncode or json.loads(check.stdout).get("status") != "unlocked":
    sys.exit("Session validation failed; no session saved.")
target = Path("/etc/3dvr/secrets-broker/vault-session")
fd = os.open(str(target), os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, "w") as output:
    os.fchmod(output.fileno(), 0o600)
    output.write(session)
subprocess.run(["systemctl", "start", "3dvr-bitwarden-vault-sync.service"], check=True)
print("Owner unlock saved locally. Check the sync service result.")
