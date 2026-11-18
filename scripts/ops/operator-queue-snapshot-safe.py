#!/usr/bin/env python3
"""Produce a consistent SQLite snapshot without replaying or changing source tasks.

NOT installed in the live backup job. Intended for reviewed use on the queue host.
Example: python3 operator-queue-snapshot-safe.py --source /path/queue.sqlite --output /safe/new.sqlite
Use --self-test to exercise a synthetic WAL source. Never overwrites an output.
"""
import argparse
import contextlib
import hashlib
import json
import os
import pathlib
import sqlite3
import tempfile
import time

MAX_SECONDS = 20


def snapshot(source, output):
    src = pathlib.Path(source).absolute()
    out = pathlib.Path(output).absolute()
    if not src.is_file() or src.is_symlink() or not out.parent.is_dir():
        raise ValueError("source_regular_file_and_existing_output_directory_required")
    if out.suffix != ".sqlite" or out.exists() or out.is_symlink():
        raise ValueError("output_must_be_new_sqlite_file")
    if src.resolve() == out.resolve():
        raise ValueError("source_equals_output")
    started = time.monotonic()
    fd, tmp = tempfile.mkstemp(prefix=".operator-snapshot-", suffix=".sqlite", dir=out.parent)
    os.fchmod(fd, 0o600)
    os.close(fd)
    try:
        source_uri = src.as_uri() + "?mode=ro"  # Encode %, #, ? and other URI metacharacters.
        with contextlib.closing(sqlite3.connect(source_uri, uri=True, timeout=3)) as conn:
            # sqlite3.backup acquires SQLite's consistent read snapshot, including WAL.
            with contextlib.closing(sqlite3.connect(tmp, timeout=3)) as dst:
                def progress(status, remaining, total):
                    if time.monotonic() - started > MAX_SECONDS:
                        raise TimeoutError("sqlite_backup_deadline")
                conn.backup(dst, pages=64, sleep=0.01, progress=progress)
                # A backup of a WAL-mode source inherits WAL mode; convert the
                # private snapshot to a single portable rollback-journal file.
                if dst.execute("PRAGMA journal_mode=DELETE").fetchone()[0] != "delete":
                    raise RuntimeError("snapshot_not_standalone")
                result = dst.execute("PRAGMA integrity_check").fetchone()[0]
                if result != "ok":
                    raise RuntimeError("snapshot_integrity_failed")
                count = dst.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        # Durably write the standalone file before atomic no-clobber publication.
        with open(tmp, "rb") as f:
            os.fsync(f.fileno())
        os.link(tmp, out)  # Fails rather than replacing an existing backup.
        dir_fd = os.open(out.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
        h = hashlib.sha256()
        with open(out, "rb") as f:
            for block in iter(lambda: f.read(65536), b""):
                h.update(block)
        return {"status": "ok", "integrity_check": result, "tasks": count,
                "bytes": out.stat().st_size, "sha256": h.hexdigest()}
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def self_test():
    with tempfile.TemporaryDirectory(prefix="operator-queue-snapshot-test-") as root:
        src = pathlib.Path(root) / "live.sqlite"
        out = pathlib.Path(root) / "snapshot.sqlite"
        writer = sqlite3.connect(src, isolation_level=None, timeout=3)
        try:
            assert writer.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
            writer.execute("CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT NOT NULL)")
            writer.executemany("INSERT INTO tasks VALUES (?, 'queued')", [(i,) for i in range(7)])
            writer.execute("BEGIN IMMEDIATE")
            writer.execute("INSERT INTO tasks VALUES (999, 'uncommitted')")
            assert pathlib.Path(str(src) + "-wal").exists(), "WAL not present"
            details = snapshot(str(src), str(out))
            assert details["tasks"] == 7, details
            with sqlite3.connect("file:" + str(out) + "?mode=ro", uri=True) as read:
                assert read.execute("SELECT COUNT(*) FROM tasks WHERE id=999").fetchone()[0] == 0
                assert read.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
            try:
                snapshot(str(src), str(out))
                raise AssertionError("overwrite was permitted")
            except ValueError as e:
                assert str(e) == "output_must_be_new_sqlite_file"
            assert sqlite3.connect(out).execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 7
            try:
                snapshot(str(src), str(pathlib.Path(root) / "missing" / "new.sqlite"))
                raise AssertionError("missing parent directory accepted")
            except ValueError:
                pass
            writer.execute("ROLLBACK")
            return {"wal_present": True, "committed_tasks_visible": 7,
                    "uncommitted_tasks_excluded": True, "overwrite_rejected": True,
                    "missing_directory_rejected": True, "snapshot_sha256": details["sha256"]}
        finally:
            writer.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--source")
    p.add_argument("--output")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args()
    if a.self_test:
        print(json.dumps(self_test(), sort_keys=True))
    elif a.source and a.output:
        print(json.dumps(snapshot(a.source, a.output), sort_keys=True))
    else:
        p.error("specify --self-test or both --source and --output")
