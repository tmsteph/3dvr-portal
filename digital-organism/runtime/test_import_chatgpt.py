import json
import tempfile
import unittest
from pathlib import Path

from import_chatgpt import normalize


class ChatGPTImportTests(unittest.TestCase):
    def test_normalizes_export_messages(self):
        payload = [
            {
                "id": "conv-1",
                "title": "Digital Organism",
                "mapping": {
                    "node-user": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Remember our projects."]},
                            "create_time": 1,
                        }
                    },
                    "node-assistant": {
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"parts": ["I will use retrieved memory."]},
                            "create_time": 2,
                        }
                    },
                },
            }
        ]
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "conversations.json"
            output = Path(temp) / "chatgpt.jsonl"
            source.write_text(json.dumps(payload), encoding="utf-8")
            count = normalize(source, output)
            rows = [
                json.loads(line)
                for line in output.read_text(encoding="utf-8").splitlines()
            ]

        self.assertEqual(count, 2)
        self.assertEqual(rows[0]["source_type"], "chatgpt-export")
        self.assertEqual(rows[0]["source_id"], "conv-1:node-user")
        self.assertIn("user", rows[0]["subject"])
        self.assertEqual(rows[1]["content"], "I will use retrieved memory.")


if __name__ == "__main__":
    unittest.main()
