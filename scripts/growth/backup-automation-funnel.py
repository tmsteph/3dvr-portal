#!/usr/bin/env python3
"""Consistent private SQLite snapshots; never copy live WAL files."""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
os.umask(0o077)
source = Path(os.environ.get("AUTOMATION_FUNNEL_DB", "/opt/3dvr-portal-production/state/automation-funnel/leads.sqlite"))
if not source.is_file():
    print("No funnel database exists yet; no backup required.")
    raise SystemExit(0)
directory = source.parent / "backups"
directory.mkdir(mode=0o700, exist_ok=True)
target = directory / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".sqlite")
with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as live, sqlite3.connect(target) as snapshot:
    live.backup(snapshot)
    if snapshot.execute("PRAGMA quick_check").fetchone()[0] != "ok":
        raise RuntimeError("Funnel backup verification failed")
os.chmod(target, 0o600)
for old in sorted(directory.glob("*.sqlite"), reverse=True)[14:]:
    old.unlink()
print("Funnel backup verified; retaining 14 snapshots.")
