#!/usr/bin/env python3
"""Refresh the native Vercel session and checkpoint it without logging credentials."""
import pathlib, subprocess, sys
cli='/root/.openclaw/tools/node/bin/vercel'
subprocess.run([cli,'whoami'],capture_output=True,check=True,timeout=30)
auth=pathlib.Path('/root/.local/share/com.vercel.cli/auth.json').read_bytes()
result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=8',
    '3dvr-ovh','sudo -n node /usr/local/lib/3dvr/checkpoint-vercel-cli.cjs'],
    input=auth,capture_output=True,timeout=90)
sys.stdout.buffer.write(result.stdout)
if result.returncode:
    print('Credential checkpoint failed; existing credentials retained.',file=sys.stderr)
sys.exit(result.returncode)
