import json
import tempfile
import unittest
from pathlib import Path

import organism


class OrganismRememberMeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        organism.DB_PATH = Path(self.temp.name) / "organism.db"

    def tearDown(self):
        self.temp.cleanup()

    def test_ingest_is_idempotent_by_provenance(self):
        path = Path(self.temp.name) / "messages.jsonl"
        row = {
            "content": "The v0.1 milestone is Remember Me.",
            "subject": "Digital Organism",
            "source_type": "test",
            "source_id": "message-1",
        }
        path.write_text(json.dumps(row) + "\n", encoding="utf-8")
        organism.ingest(str(path))
        organism.ingest(str(path))
        with organism.connect() as db:
            count = db.execute(
                "SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NULL"
            ).fetchone()["n"]
        self.assertEqual(count, 1)

    def test_correction_hides_superseded_memory_and_keeps_revision(self):
        old_id = organism.remember(
            "The primary worker is Alpha.",
            subject="infrastructure",
            source_type="test",
            source_id="infra-1",
        )
        new_id = organism.correct(old_id, "The primary worker is Beta.")
        hits = organism.recall("primary worker", limit=10)
        contents = [row["content"] for _, row in hits]
        self.assertIn("The primary worker is Beta.", contents)
        self.assertNotIn("The primary worker is Alpha.", contents)

        with organism.connect() as db:
            revision = db.execute(
                "SELECT * FROM memory_revisions WHERE old_memory_id = ?",
                (old_id,),
            ).fetchone()
        self.assertEqual(revision["new_memory_id"], new_id)

    def test_scorecard_measures_retrieval(self):
        organism.remember(
            "The v0.1 milestone is named Remember Me.",
            subject="Digital Organism",
        )
        suite = {
            "name": "tiny",
            "cases": [
                {
                    "name": "milestone",
                    "question": "What is the v0.1 milestone called?",
                    "expected_all": ["remember me"],
                }
            ],
        }
        path = Path(self.temp.name) / "suite.json"
        path.write_text(json.dumps(suite), encoding="utf-8")
        result = organism.evaluate_suite(str(path))
        self.assertEqual(result["score"], 1.0)


if __name__ == "__main__":
    unittest.main()
