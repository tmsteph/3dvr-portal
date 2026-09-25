import json
import tempfile
import unittest
from pathlib import Path

import ai_lab


class AILabTests(unittest.TestCase):
    def test_suite_has_twenty_unique_tasks(self):
        suite = ai_lab.load_json(ai_lab.DEFAULT_SUITE)
        ai_lab.validate_suite(suite)
        self.assertEqual(len(suite["tasks"]), 20)
        self.assertEqual(len({task["id"] for task in suite["tasks"]}), 20)

    def test_run_scoring_keeps_blocked_in_denominator(self):
        suite = ai_lab.load_json(ai_lab.DEFAULT_SUITE)
        with tempfile.TemporaryDirectory() as tmp:
            run_path = Path(tmp) / "run.json"
            ai_lab.init_run(suite, run_path)
            run = json.loads(run_path.read_text())
            run["results"][0]["status"] = "pass"
            run["results"][1]["status"] = "blocked"
            score = ai_lab.score_run(suite, run)
            self.assertEqual(score["passed"], 1)
            self.assertEqual(score["total"], 20)
            self.assertEqual(score["score"], 0.05)


if __name__ == "__main__":
    unittest.main()
