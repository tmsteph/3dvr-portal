import importlib.util
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

path = Path(__file__).parents[1] / "tools/github-open-runner.py"
spec = importlib.util.spec_from_file_location("runner", path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def alive(pid):
    try:
        return Path(f"/proc/{pid}/stat").read_text().split(")")[-1].split()[0] != "Z"
    except FileNotFoundError:
        return False


class JobSafetyTests(unittest.TestCase):
    def test_timeout_kills_grandchild(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = Path(directory) / "pid"
            with self.assertRaises(subprocess.TimeoutExpired):
                runner.run(["bash", "-c", f"sleep 30 & echo $! > {pidfile}; wait"], timeout=0.3)
            self.assertFalse(alive(int(pidfile.read_text())))

    def test_normal_exit_cleans_background_child(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = Path(directory) / "pid"
            result = runner.run(["bash", "-c", f"sleep 30 & echo $! > {pidfile}; exit 0"], timeout=2)
            self.assertEqual(result.returncode, 0)
            self.assertFalse(alive(int(pidfile.read_text())))

    def test_admission_reserves_production_memory(self):
        profile = runner.job_profile("ovh", {})
        self.assertIn("headroom", runner.admission_reason(profile, available_mib=2500, memory_pressure=0))
        self.assertEqual("", runner.admission_reason(profile, available_mib=3000, memory_pressure=0))
        self.assertIn("stalls", runner.admission_reason(profile, available_mib=3000, memory_pressure=30))

    def test_recovery_is_bounded_but_not_queued_by_pressure(self):
        profile = runner.job_profile("hetzner", {"priority": "recovery"})
        self.assertEqual(128, profile["memory_mib"])
        self.assertEqual("", runner.admission_reason(profile, available_mib=0, memory_pressure=100))
        with self.assertRaises(ValueError):
            runner.job_profile("hetzner", {"priority": "recovery", "memory_mib": 2048})


    def test_output_capture_is_bounded(self):
        result = runner.run(["python3", "-c", "print('x' * 10000)"], output_limit=100)
        self.assertEqual(0, result.returncode)
        self.assertLess(len(result.stdout), 150)
        self.assertIn("truncated", result.stdout)

    def test_low_headroom_leaves_issue_unclaimed(self):
        from unittest.mock import patch
        config = {"device_id": "hetzner", "queue_repo": "test/queue", "allowed_authors": ["tmsteph"]}
        issue = {"number": 1, "author": {"login": "tmsteph"},
                 "body": '{"action":"shell","device":"hetzner","command":"echo no"}'}
        with patch.object(runner, "already_claimed", return_value=False), \
             patch.object(runner, "admission_reason", return_value="low headroom"), \
             patch.object(runner, "gh") as gh, patch.object(runner, "execute_job") as execute:
            runner.process(config, issue)
            gh.assert_not_called()
            execute.assert_not_called()

    @unittest.skipUnless(Path("/run/systemd/system").exists() and os.geteuid() == 0, "systemd integration")
    def test_scope_cleans_child_that_detaches(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = Path(directory) / "pid"
            result = runner.execute_job(f"setsid sleep 30 >/dev/null 2>&1 & echo $! > {pidfile}; sleep 0.2",
                                        profile=runner.job_profile("hetzner", {"priority": "recovery"}), timeout=3)
            self.assertEqual(0, result.returncode)
            time.sleep(0.2)
            self.assertFalse(alive(int(pidfile.read_text())))


if __name__ == "__main__":
    unittest.main()
