import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("reaper", Path(__file__).parents[1] / "scripts/ops/reap-orphan-browser-controllers.py")
reaper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reaper)


class ReaperTests(unittest.TestCase):
    def test_only_old_orphan_controller_in_exact_service(self):
        cgroup = "0::/3dvr.slice/3dvr-recovery.slice/desktop-commander-remote.service\n"
        self.assertTrue(reaper.stale_controller("agent-browser-l", 1, 86401, cgroup))
        for comm, parent, age, group in [
            ("chrome", 1, 90000, cgroup),
            ("agent-browser-l", 1, 90000, cgroup.strip() + "-other"),
            ("agent-browser-l", 123, 90000, cgroup),
            ("agent-browser-l", 1, 86400, cgroup),
            ("agent-browser-l", 1, 90000, "0::/system.slice/3dvr-browser-lane@general.service"),
        ]:
            self.assertFalse(reaper.stale_controller(comm, parent, age, group))


if __name__ == "__main__":
    unittest.main()
