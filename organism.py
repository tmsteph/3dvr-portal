#!/usr/bin/env python3
"""Tiny seed for the 3DVR Digital Organism.

Stdlib-only local memory store. Prove durable memory, provenance, retrieval,
correction/deletion, and evaluation before adding model or vector complexity.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from providers import make_provider

DB_PATH = Path(os.getenv("ORGANISM_DB", "organism.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'fact',
    subject TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_id TEXT,
    created_at TEXT NOT NULL,
    valid_until TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    importance REAL NOT NULL DEFAULT 0.5,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_subject ON memories(subject);
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source_type, source_id);

CREATE TABLE IF NOT EXISTS memory_revisions (
    id TEXT PRIMARY KEY,
    old_memory_id TEXT NOT NULL,
    new_memory_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'correction',
    created_at TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db


def remember(
    content: str,
    *,
    kind: str = "fact",
    subject: str = "",
    source_type: str = "manual",
    source_id: str | None = None,
) -> str:
    """Store one durable memory, deduplicating stable provenance when present."""
    with connect() as db:
        if source_id:
            existing = db.execute(
                "SELECT id FROM memories "
                "WHERE source_type = ? AND source_id = ? AND deleted_at IS NULL",
                (source_type, source_id),
            ).fetchone()
            if existing:
                return str(existing["id"])

        memory_id = f"mem_{uuid.uuid4().hex[:12]}"
        db.execute(
            "INSERT INTO memories "
            "(id, kind, subject, content, source_type, source_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (memory_id, kind, subject, content, source_type, source_id, now()),
        )
    return memory_id


def tokens(text: str) -> set[str]:
    return {
        t
        for t in re.findall(r"[a-z0-9][a-z0-9._-]+", text.lower())
        if len(t) > 1
    }


def recall(query: str, limit: int = 5) -> list[tuple[float, sqlite3.Row]]:
    q = tokens(query)
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM memories "
            "WHERE deleted_at IS NULL "
            "AND (valid_until IS NULL OR valid_until > ?)",
            (now(),),
        ).fetchall()

    ranked = []
    for row in rows:
        haystack = tokens(f"{row['subject']} {row['content']} {row['kind']}")
        overlap = len(q & haystack)
        union = max(1, len(q | haystack))
        lexical = overlap / union
        score = (
            lexical * 0.75
            + float(row["importance"]) * 0.15
            + float(row["confidence"]) * 0.10
        )
        if overlap or not q:
            ranked.append((score, row))
    return sorted(ranked, key=lambda item: item[0], reverse=True)[:limit]


def ingest(path: str) -> int:
    """Ingest normalized JSONL records.

    Each line may contain content/text/message plus optional kind, subject,
    source_type and source_id. Stable source IDs make ingestion idempotent.
    """
    count = 0
    with open(path, "r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            content = item.get("content") or item.get("text") or item.get("message")
            if not content:
                continue
            remember(
                str(content),
                kind=str(item.get("kind", "event")),
                subject=str(item.get("subject", "")),
                source_type=str(item.get("source_type", "jsonl")),
                source_id=str(item.get("source_id", f"{Path(path).name}:{line_no}")),
            )
            count += 1
    return count


def explain(memory_id: str) -> None:
    with connect() as db:
        row = db.execute(
            "SELECT * FROM memories WHERE id = ?", (memory_id,)
        ).fetchone()
        revisions = db.execute(
            "SELECT * FROM memory_revisions "
            "WHERE old_memory_id = ? OR new_memory_id = ? "
            "ORDER BY created_at",
            (memory_id, memory_id),
        ).fetchall()
    if not row:
        raise SystemExit(f"Memory not found: {memory_id}")
    payload = dict(row)
    payload["revisions"] = [dict(revision) for revision in revisions]
    print(json.dumps(payload, indent=2))


def forget(memory_id: str) -> None:
    with connect() as db:
        result = db.execute(
            "UPDATE memories SET deleted_at = ? "
            "WHERE id = ? AND deleted_at IS NULL",
            (now(), memory_id),
        )
    if not result.rowcount:
        raise SystemExit(f"Active memory not found: {memory_id}")


def correct(memory_id: str, content: str, *, reason: str = "correction") -> str:
    """Replace an active memory while preserving an auditable revision edge."""
    with connect() as db:
        old = db.execute(
            "SELECT * FROM memories WHERE id = ? AND deleted_at IS NULL",
            (memory_id,),
        ).fetchone()
        if not old:
            raise SystemExit(f"Active memory not found: {memory_id}")

        new_id = f"mem_{uuid.uuid4().hex[:12]}"
        created = now()
        db.execute(
            "INSERT INTO memories "
            "(id, kind, subject, content, source_type, source_id, created_at, "
            "valid_until, confidence, importance) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                new_id,
                old["kind"],
                old["subject"],
                content,
                old["source_type"],
                old["source_id"],
                created,
                old["valid_until"],
                old["confidence"],
                old["importance"],
            ),
        )
        db.execute(
            "UPDATE memories SET deleted_at = ? WHERE id = ?",
            (created, memory_id),
        )
        db.execute(
            "INSERT INTO memory_revisions "
            "(id, old_memory_id, new_memory_id, reason, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                f"rev_{uuid.uuid4().hex[:12]}",
                memory_id,
                new_id,
                reason,
                created,
            ),
        )
    return new_id


def context_for(query: str, limit: int = 5) -> str:
    """Build the auditable user-owned context supplied to a reasoning provider."""
    hits = recall(query, limit)
    if not hits:
        return "No relevant stored memories were retrieved."

    lines = [
        "Retrieved user-owned memories follow.",
        "Treat them as context, not unquestionable truth; provenance is included.",
    ]
    for score, row in hits:
        source = row["source_type"]
        if row["source_id"]:
            source = f"{source}:{row['source_id']}"
        subject = f" subject={row['subject']!r}" if row["subject"] else ""
        lines.append(
            f"- id={row['id']} score={score:.3f} kind={row['kind']}"
            f"{subject} source={source!r}: {row['content']}"
        )
    return "\n".join(lines)


def ask(
    prompt: str,
    *,
    provider_name: str,
    model: str | None,
    base_url: str | None,
    api_key: str | None,
    limit: int,
) -> str:
    provider = make_provider(
        provider_name,
        model=model,
        base_url=base_url,
        api_key=api_key,
    )
    context = context_for(prompt, limit)
    messages = [
        {
            "role": "system",
            "content": (
                "You are the reasoning engine inside a user-owned personal "
                "intelligence system. Use the supplied memory context when relevant. "
                "Do not claim a memory is current when its provenance is insufficient.\n\n"
                f"{context}"
            ),
        },
        {"role": "user", "content": prompt},
    ]
    return provider.complete(messages)


def evaluate_suite(path: str, limit: int = 5) -> dict[str, object]:
    """Evaluate deterministic retrieval without requiring any external model."""
    suite = json.loads(Path(path).read_text(encoding="utf-8"))
    cases = suite["cases"] if isinstance(suite, dict) else suite
    results = []
    passed = 0

    for case in cases:
        hits = recall(str(case["question"]), limit=limit)
        retrieved = "\n".join(str(row["content"]) for _, row in hits).lower()
        expected_all = [str(term).lower() for term in case.get("expected_all", [])]
        expected_any = [str(term).lower() for term in case.get("expected_any", [])]
        forbidden = [str(term).lower() for term in case.get("forbidden", [])]

        all_ok = all(term in retrieved for term in expected_all)
        any_ok = not expected_any or any(term in retrieved for term in expected_any)
        forbidden_ok = all(term not in retrieved for term in forbidden)
        ok = all_ok and any_ok and forbidden_ok
        passed += int(ok)
        results.append(
            {
                "name": case.get("name", case["question"]),
                "passed": ok,
                "retrieved_ids": [row["id"] for _, row in hits],
            }
        )

    total = len(results)
    return {
        "suite": suite.get("name", Path(path).stem) if isinstance(suite, dict) else Path(path).stem,
        "passed": passed,
        "total": total,
        "score": (passed / total) if total else 1.0,
        "cases": results,
    }


def self_eval() -> int:
    probe = f"eval-{uuid.uuid4().hex[:8]}"
    memory_id = remember(
        f"The evaluation token is {probe}.",
        kind="lesson",
        subject="self-evaluation",
    )
    hits = recall(f"What is the evaluation token {probe}?")
    ok = any(row["id"] == memory_id for _, row in hits)
    forget(memory_id)
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="organism",
        description="3DVR Digital Organism memory seed",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("remember")
    p.add_argument("content")
    p.add_argument("--kind", default="fact")
    p.add_argument("--subject", default="")

    p = sub.add_parser("recall")
    p.add_argument("query")
    p.add_argument("--limit", type=int, default=5)

    p = sub.add_parser("context")
    p.add_argument("query")
    p.add_argument("--limit", type=int, default=5)

    p = sub.add_parser("ask")
    p.add_argument("prompt")
    p.add_argument(
        "--provider",
        required=True,
        choices=("echo", "ollama", "openai-compatible"),
        help="Explicit reasoning provider. No external provider is chosen implicitly.",
    )
    p.add_argument("--model")
    p.add_argument("--base-url")
    p.add_argument(
        "--api-key-env",
        default="ORGANISM_API_KEY",
        help="Environment variable containing the provider API key.",
    )
    p.add_argument("--limit", type=int, default=5)

    p = sub.add_parser("ingest")
    p.add_argument("path")

    p = sub.add_parser("explain")
    p.add_argument("memory_id")

    p = sub.add_parser("forget")
    p.add_argument("memory_id")

    p = sub.add_parser("correct")
    p.add_argument("memory_id")
    p.add_argument("content")
    p.add_argument("--reason", default="correction")

    p = sub.add_parser("score")
    p.add_argument("suite")
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--min-score", type=float, default=0.0)

    sub.add_parser("eval")

    args = parser.parse_args()

    if args.command == "remember":
        print(remember(args.content, kind=args.kind, subject=args.subject))
    elif args.command == "recall":
        for score, row in recall(args.query, args.limit):
            print(
                f"{score:.3f}\t{row['id']}\t"
                f"[{row['kind']}] {row['subject']} — {row['content']}"
            )
    elif args.command == "context":
        print(context_for(args.query, args.limit))
    elif args.command == "ask":
        try:
            print(
                ask(
                    args.prompt,
                    provider_name=args.provider,
                    model=args.model,
                    base_url=args.base_url,
                    api_key=os.getenv(args.api_key_env),
                    limit=args.limit,
                )
            )
        except (RuntimeError, ValueError) as exc:
            raise SystemExit(str(exc)) from exc
    elif args.command == "ingest":
        print(f"ingested {ingest(args.path)} records")
    elif args.command == "explain":
        explain(args.memory_id)
    elif args.command == "forget":
        forget(args.memory_id)
        print(f"forgot {args.memory_id}")
    elif args.command == "correct":
        print(correct(args.memory_id, args.content, reason=args.reason))
    elif args.command == "score":
        result = evaluate_suite(args.suite, limit=args.limit)
        print(json.dumps(result, indent=2))
        return 0 if float(result["score"]) >= args.min_score else 1
    elif args.command == "eval":
        return self_eval()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
