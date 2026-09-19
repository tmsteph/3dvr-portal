#!/usr/bin/env python3
"""Normalize a ChatGPT conversations.json export into organism JSONL.

The output is intended for local/private use. By default it is written under
data/private/, which is gitignored by this repository.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable


def message_text(message: dict) -> str:
    content = message.get("content") or {}
    parts = content.get("parts")
    if isinstance(parts, list):
        text_parts = [part for part in parts if isinstance(part, str)]
        if text_parts:
            return "\n".join(text_parts).strip()
    text = content.get("text")
    return text.strip() if isinstance(text, str) else ""


def iter_records(conversations: Iterable[dict]) -> Iterable[dict]:
    for conversation in conversations:
        conversation_id = str(conversation.get("id") or conversation.get("conversation_id") or "unknown")
        title = str(conversation.get("title") or "Untitled conversation")
        mapping = conversation.get("mapping") or {}
        for node_id, node in mapping.items():
            message = (node or {}).get("message")
            if not isinstance(message, dict):
                continue
            role = str(((message.get("author") or {}).get("role")) or "unknown")
            text = message_text(message)
            if not text:
                continue
            yield {
                "kind": "conversation",
                "subject": f"{title} / {role}",
                "content": text,
                "source_type": "chatgpt-export",
                "source_id": f"{conversation_id}:{node_id}",
                "metadata": {
                    "conversation_id": conversation_id,
                    "conversation_title": title,
                    "role": role,
                    "create_time": message.get("create_time"),
                },
            }


def normalize(input_path: Path, output_path: Path) -> int:
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    conversations = payload if isinstance(payload, list) else payload.get("conversations", [])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with output_path.open("w", encoding="utf-8") as handle:
        for record in iter_records(conversations):
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize ChatGPT export for the Digital Organism")
    parser.add_argument("input", help="Path to conversations.json")
    parser.add_argument(
        "--output",
        default="data/private/chatgpt.jsonl",
        help="Normalized JSONL destination (default: data/private/chatgpt.jsonl)",
    )
    args = parser.parse_args()
    count = normalize(Path(args.input), Path(args.output))
    print(f"normalized {count} messages -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
