#!/usr/bin/env python3
"""Run Forge's existing Codex login without unrelated MCP side processes."""
import os
from pathlib import Path
import re
import sys
import tomllib

binary = os.environ.get('THREEDVR_FORGE_CODEX_BINARY', '/opt/3dvr-forge/bin/codex-real')
config = Path(os.environ.get('CODEX_HOME', '/root/.codex')) / 'config.toml'
data = tomllib.loads(config.read_text()) if config.exists() else {}
args = [binary, '-c', 'approval_policy="never"']
for name in data.get('mcp_servers', {}):
    if not re.fullmatch(r'[A-Za-z0-9_-]+', name):
        raise ValueError('Unsupported MCP configuration name')
    args.extend(['-c', 'mcp_servers.' + name + '.enabled=false'])
os.execv(binary, args + sys.argv[1:])
