# 3DVR Brain

3DVR Brain is the human-facing knowledge workspace for the Digital Organism.

The design goal is intentionally simple:

> **Your brain belongs to you. The interface and the AI are replaceable.**

Brain is not a proprietary database. A vault is an ordinary folder of Markdown
files that works with Git, text editors, Obsidian-compatible wikilinks, scripts,
and AI agents.

## v0

The first slice includes:

- local Markdown files as the source of truth;
- optional YAML frontmatter;
- `[[wikilinks]]` and backlinks;
- full-vault text search;
- generated Maps of Content (MOCs);
- a stdlib-only CLI/indexer in `../digital-organism/runtime/brain.py`;
- a browser UI that can open and save a local Markdown folder through the File
  System Access API.

The browser UI intentionally has no account requirement and no server-side note
database.

## Vault convention

The CLI can seed a shallow structure:

```text
Brain/
├── 00 Inbox/
├── 01 Daily/
├── 10 Projects/
├── 20 Knowledge/
├── 90 Archive/
├── Home.md
└── Brain Map.md
```

Folders are a convenience, not the ontology. Links, tags, provenance, search,
and generated indexes should remain useful even when a user reorganizes files.

A note may use frontmatter such as:

```md
---
title: "3DVR Brain"
tags: [project, knowledge]
created: 2026-09-21
source: conversation
---

# 3DVR Brain

The AI is replaceable. [[Digital Organism]] owns durable memory.
```

## CLI

From `digital-organism/runtime`:

```bash
python3 brain.py init ~/Brain
python3 brain.py index ~/Brain
python3 brain.py search ~/Brain "portable memory"
python3 brain.py moc ~/Brain
```

The generated `.3dvr-brain-index.json` is derived state. It can be deleted and
rebuilt at any time.

## Relationship to Digital Organism

Brain is the inspectable Markdown layer. Digital Organism remains the durable
memory/runtime layer with provenance, revisions, evaluation, and model-provider
boundaries.

The intended flow is:

```text
human + agents
      ↓
 Markdown vault
      ↓
 Brain index / MOCs
      ↓
 Digital Organism
      ↓
 replaceable models and tools
```

Future sync should preserve this boundary: the vault remains portable even if a
sync service, UI, model provider, or 3DVR-hosted convenience layer disappears.

## Compatibility

The format deliberately uses boring Markdown, YAML frontmatter, and wikilinks so
existing Obsidian-style vaults can be adopted incrementally rather than migrated
into a closed schema.

The browser folder picker currently works best in Chromium desktop browsers.
Mobile/offline import-export and PWA storage are the next compatibility target.
