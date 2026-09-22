import tempfile
import unittest
from pathlib import Path

import brain


class BrainTests(unittest.TestCase):
    def test_frontmatter_wikilinks_backlinks_and_search(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Project.md").write_text(
                "---\ntitle: Project Astra\ntags: [project, ai]\n---\n\n"
                "# Project Astra\nBuild a portable knowledge system.\n",
                encoding="utf-8",
            )
            (root / "Decision.md").write_text(
                "---\ntitle: Storage decision\ntags: [decision]\n---\n\n"
                "We chose [[Project Astra]] because Markdown stays portable.\n",
                encoding="utf-8",
            )

            notes = brain.scan_vault(root)
            index = brain.build_index(notes)
            project = next(
                note for note in index["notes"] if note["title"] == "Project Astra"
            )
            self.assertEqual(project["backlinks"], ["Decision.md"])
            self.assertEqual(index["unresolved_links"], {})

            hits = brain.search(notes, "portable project")
            self.assertEqual(hits[0][1].title, "Project Astra")

    def test_init_and_moc_are_plain_markdown(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "vault"
            brain.init_vault(root)
            self.assertTrue((root / "Home.md").exists())
            self.assertTrue((root / "00 Inbox" / "Inbox.md").exists())

            notes = brain.scan_vault(root)
            moc = brain.render_moc(notes)
            self.assertIn("[[Home|Home]]", moc)
            self.assertIn("generated_by: 3dvr-brain", moc)


if __name__ == "__main__":
    unittest.main()
