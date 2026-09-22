#!/usr/bin/env python3
"""3DVR Brain: a stdlib-only Markdown vault index for the Digital Organism.

The files remain the source of truth. This module only derives an index that can
be rebuilt at any time, keeping the vault portable across editors and models.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.DOTALL)
WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]")
WORD_RE = re.compile(r"[a-z0-9][a-z0-9._-]+", re.IGNORECASE)


@dataclass(frozen=True)
class Note:
    path: str
    title: str
    tags: list[str]
    links: list[str]
    body: str

    @property
    def slug(self) -> str:
        return Path(self.path).stem


def _parse_scalar(value: str) -> str | bool | int | float:
    value = value.strip().strip('"').strip("'")
    low = value.lower()
    if low in {"true", "false"}:
        return low == "true"
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        return value


def parse_frontmatter(text: str) -> tuple[dict[str, object], str]:
    """Parse the deliberately small YAML subset used by Brain notes.

    Supports scalar values and one-line lists. Unknown/complex YAML stays in the
    file untouched; Brain simply ignores fields it cannot safely interpret.
    """
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}, text

    data: dict[str, object] = {}
    for raw_line in match.group(1).splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        if ":" not in raw_line:
            continue
        key, raw_value = raw_line.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if not key:
            continue
        if raw_value.startswith("[") and raw_value.endswith("]"):
            inner = raw_value[1:-1].strip()
            data[key] = [] if not inner else [
                str(_parse_scalar(item)) for item in inner.split(",")
            ]
        else:
            data[key] = _parse_scalar(raw_value)
    return data, text[match.end():]


def _title_from_body(body: str, fallback: str) -> str:
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip() or fallback
    return fallback


def read_note(path: Path, root: Path) -> Note:
    text = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(text)
    title = str(meta.get("title") or _title_from_body(body, path.stem))
    raw_tags = meta.get("tags", [])
    if isinstance(raw_tags, str):
        tags = [tag.strip().lstrip("#") for tag in raw_tags.split() if tag.strip()]
    elif isinstance(raw_tags, list):
        tags = [str(tag).strip().lstrip("#") for tag in raw_tags if str(tag).strip()]
    else:
        tags = []
    links = sorted({match.strip() for match in WIKILINK_RE.findall(body) if match.strip()})
    return Note(
        path=path.relative_to(root).as_posix(),
        title=title,
        tags=sorted(set(tags)),
        links=links,
        body=body,
    )


def scan_vault(root: Path) -> list[Note]:
    root = root.expanduser().resolve()
    notes = []
    for path in sorted(root.rglob("*.md")):
        if any(part.startswith(".") for part in path.relative_to(root).parts):
            continue
        notes.append(read_note(path, root))
    return notes


def _aliases(note: Note) -> set[str]:
    return {note.title.casefold(), note.slug.casefold(), note.path.casefold()}


def build_index(notes: list[Note]) -> dict[str, object]:
    aliases: dict[str, str] = {}
    for note in notes:
        for alias in _aliases(note):
            aliases.setdefault(alias, note.path)

    backlinks: dict[str, list[str]] = {note.path: [] for note in notes}
    unresolved: dict[str, list[str]] = {}
    for source in notes:
        for target in source.links:
            target_path = aliases.get(target.casefold())
            if target_path:
                backlinks[target_path].append(source.path)
            else:
                unresolved.setdefault(target, []).append(source.path)

    return {
        "version": 1,
        "notes": [
            {
                **asdict(note),
                "body": note.body[:1200],
                "backlinks": sorted(backlinks[note.path]),
            }
            for note in notes
        ],
        "unresolved_links": {
            key: sorted(value) for key, value in sorted(unresolved.items())
        },
    }


def tokens(text: str) -> set[str]:
    return {token.casefold() for token in WORD_RE.findall(text) if len(token) > 1}


def search(notes: list[Note], query: str, limit: int = 10) -> list[tuple[float, Note]]:
    wanted = tokens(query)
    ranked: list[tuple[float, Note]] = []
    for note in notes:
        title_tokens = tokens(note.title)
        body_tokens = tokens(note.body)
        tag_tokens = {tag.casefold() for tag in note.tags}
        overlap = len(wanted & (title_tokens | body_tokens | tag_tokens))
        if wanted and not overlap:
            continue
        title_overlap = len(wanted & title_tokens)
        tag_overlap = len(wanted & tag_tokens)
        score = overlap + (title_overlap * 2.0) + (tag_overlap * 1.5)
        ranked.append((score, note))
    return sorted(
        ranked,
        key=lambda item: (-item[0], item[1].title.casefold()),
    )[:limit]


def render_moc(notes: list[Note], title: str = "Brain Map") -> str:
    groups: dict[str, list[Note]] = {}
    for note in notes:
        group = note.tags[0] if note.tags else "notes"
        groups.setdefault(group, []).append(note)

    lines = [
        "---",
        f'title: "{title}"',
        "type: moc",
        "generated_by: 3dvr-brain",
        "---",
        "",
        f"# {title}",
        "",
        "> Generated from plain Markdown. Edit the source notes; rebuild this map anytime.",
        "",
    ]
    for group in sorted(groups):
        lines.extend([f"## {group}", ""])
        for note in sorted(groups[group], key=lambda item: item.title.casefold()):
            lines.append(f"- [[{note.path[:-3]}|{note.title}]]")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def init_vault(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    inbox = root / "00 Inbox"
    daily = root / "01 Daily"
    projects = root / "10 Projects"
    knowledge = root / "20 Knowledge"
    archive = root / "90 Archive"
    for folder in (inbox, daily, projects, knowledge, archive):
        folder.mkdir(exist_ok=True)

    home = root / "Home.md"
    if not home.exists():
        home.write_text(
            "---\n"
            'title: "Home"\n'
            "tags: [moc]\n"
            "---\n\n"
            "# Home\n\n"
            "Welcome to your 3DVR Brain. These are ordinary Markdown files.\n\n"
            "- [[00 Inbox/Inbox|Inbox]]\n"
            "- [[Brain Map|Brain Map]]\n",
            encoding="utf-8",
        )
    inbox_note = inbox / "Inbox.md"
    if not inbox_note.exists():
        inbox_note.write_text(
            "---\n"
            'title: "Inbox"\n'
            "tags: [inbox]\n"
            "---\n\n"
            "# Inbox\n\n"
            "Capture first. File or archive during review.\n",
            encoding="utf-8",
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="brain",
        description="Index a portable Markdown knowledge vault",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init")
    p.add_argument("vault")

    p = sub.add_parser("index")
    p.add_argument("vault")
    p.add_argument("--output", default=".3dvr-brain-index.json")

    p = sub.add_parser("search")
    p.add_argument("vault")
    p.add_argument("query")
    p.add_argument("--limit", type=int, default=10)

    p = sub.add_parser("moc")
    p.add_argument("vault")
    p.add_argument("--output", default="Brain Map.md")
    p.add_argument("--title", default="Brain Map")

    args = parser.parse_args()
    root = Path(args.vault)

    if args.command == "init":
        init_vault(root)
        print(root.expanduser().resolve())
    elif args.command == "index":
        notes = scan_vault(root)
        output = root / args.output
        output.write_text(
            json.dumps(build_index(notes), indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"indexed {len(notes)} notes -> {output}")
    elif args.command == "search":
        for score, note in search(scan_vault(root), args.query, args.limit):
            print(f"{score:.1f}\t{note.path}\t{note.title}")
    elif args.command == "moc":
        notes = [note for note in scan_vault(root) if note.path != args.output]
        output = root / args.output
        output.write_text(render_moc(notes, args.title), encoding="utf-8")
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
