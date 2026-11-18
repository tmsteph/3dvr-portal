"""Offline regression tests for the Operator SQLite backup helper.

No network, production queue, secrets, or external services are used.
Run: python3 -m unittest discover -s tests -p test_operator_queue_snapshot.py -v
"""
import hashlib
import json
import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts/ops/operator-queue-snapshot-safe.py"


def snapshot(source, output):
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--source", str(source), "--output", str(output)],
        capture_output=True,
        text=True,
        timeout=15,
    )


class OperatorQueueSnapshotTest(unittest.TestCase):
    def test_live_wal_includes_committed_and_excludes_uncommitted(self):
        with tempfile.TemporaryDirectory() as root:
            source = pathlib.Path(root) / "queue.sqlite"
            target = pathlib.Path(root) / "snapshot.sqlite"
            writer = sqlite3.connect(source, isolation_level=None, timeout=3)
            try:
                self.assertEqual(writer.execute("PRAGMA journal_mode=WAL").fetchone()[0], "wal")
                writer.execute("CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT)")
                writer.executemany(
                    "INSERT INTO tasks VALUES (?, 'queued')", [(n,) for n in range(7)]
                )
                writer.execute("BEGIN IMMEDIATE")
                writer.execute("INSERT INTO tasks VALUES (999, 'uncommitted')")
                self.assertTrue(pathlib.Path(str(source) + "-wal").exists())
                result = snapshot(source, target)
                self.assertEqual(result.returncode, 0, result.stderr)
                receipt = json.loads(result.stdout)
                self.assertEqual(receipt["tasks"], 7)
                self.assertEqual(receipt["integrity_check"], "ok")
                with sqlite3.connect(f"{target.as_uri()}?mode=ro", uri=True) as db:
                    self.assertEqual(db.execute("PRAGMA journal_mode").fetchone()[0], "delete")
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], 7)
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM tasks WHERE id=999").fetchone()[0], 0)
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)
                self.assertEqual(list(pathlib.Path(root).glob(".operator-snapshot-*")), [])
            finally:
                writer.execute("ROLLBACK")
                writer.close()

    def test_reject_overwrite_and_symlinks_without_mutation(self):
        with tempfile.TemporaryDirectory() as root:
            root = pathlib.Path(root)
            source = root / "queue.sqlite"
            with sqlite3.connect(source) as db:
                db.execute("CREATE TABLE tasks (id INTEGER)")
            target = root / "snapshot.sqlite"
            target.write_bytes(b"preexisting sentinel")
            result = snapshot(source, target)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_bytes(), b"preexisting sentinel")
            target.unlink()
            target.symlink_to(source)
            self.assertNotEqual(snapshot(source, target).returncode, 0)
            target.unlink()
            link_source = root / "symlink.sqlite"
            link_source.symlink_to(source)
            self.assertNotEqual(snapshot(link_source, target).returncode, 0)
            self.assertFalse(target.exists())

    def test_invalid_source_missing_parent_and_corruption_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            root = pathlib.Path(root)
            source = root / "queue.sqlite"
            target = root / "snapshot.sqlite"
            self.assertNotEqual(snapshot(source, target).returncode, 0)
            self.assertFalse(target.exists())
            source.write_bytes(b"not a valid sqlite database")
            self.assertNotEqual(snapshot(source, target).returncode, 0)
            self.assertFalse(target.exists())
            source.unlink()
            with sqlite3.connect(source) as db:
                db.execute("CREATE TABLE tasks (id INTEGER)")
            self.assertNotEqual(snapshot(source, root / "missing" / "snapshot.sqlite").returncode, 0)
            self.assertFalse((root / "missing").exists())
            self.assertEqual(list(root.glob(".operator-snapshot-*")), [])

    def test_escapes_uri_metacharacters_in_source_path(self):
        with tempfile.TemporaryDirectory() as root:
            root = pathlib.Path(root)
            source = root / "queue#percent%20?file.sqlite"
            target = root / "snapshot.sqlite"
            with sqlite3.connect(source) as db:
                db.execute("CREATE TABLE tasks (id INTEGER)")
                db.execute("INSERT INTO tasks VALUES (1)")
            result = snapshot(source, target)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["tasks"], 1)

    def test_standalone_backup_is_portable_after_source_removal(self):
        # A nightly archive stages only the .sqlite member, not source WAL/SHM.
        with tempfile.TemporaryDirectory() as root:
            root = pathlib.Path(root)
            source = root / "live.sqlite"
            stage = root / "stage"
            restore = root / "isolated-restore"
            stage.mkdir()
            restore.mkdir()
            writer = sqlite3.connect(source, isolation_level=None, timeout=3)
            try:
                self.assertEqual(writer.execute("PRAGMA journal_mode=WAL").fetchone()[0], "wal")
                writer.execute("CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT)")
                writer.executemany(
                    "INSERT INTO tasks VALUES (?, 'queued')", [(n,) for n in range(12)]
                )
                snapshot_path = stage / "task-queue.sqlite"
                result = snapshot(source, snapshot_path)
                self.assertEqual(result.returncode, 0, result.stderr)
                receipt = json.loads(result.stdout)
                self.assertEqual(receipt["tasks"], 12)
            finally:
                writer.close()
            # Deliberately remove the source and relocate only the staged DB.
            source.unlink()
            for suffix in ("-wal", "-shm"):
                sidecar = pathlib.Path(str(source) + suffix)
                if sidecar.exists():
                    sidecar.unlink()
            restored_path = restore / "task-queue.sqlite"
            snapshot_path.rename(restored_path)
            self.assertFalse(pathlib.Path(str(restored_path) + "-wal").exists())
            self.assertFalse(pathlib.Path(str(restored_path) + "-shm").exists())
            with sqlite3.connect(f"{restored_path.as_uri()}?mode=ro", uri=True) as db:
                self.assertEqual(db.execute("PRAGMA journal_mode").fetchone()[0], "delete")
                self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                self.assertEqual(db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], 12)
            self.assertEqual(
                hashlib.sha256(restored_path.read_bytes()).hexdigest(), receipt["sha256"]
            )

    def test_self_test(self):
        p = subprocess.run(
            [sys.executable, str(SCRIPT), "--self-test"],
            capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertTrue(json.loads(p.stdout)["uncommitted_tasks_excluded"])


if __name__ == "__main__":
    unittest.main()
