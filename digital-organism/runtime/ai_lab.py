#!/usr/bin/env python3
"""Small local runner for the 3DVR AI Lab agent benchmark."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_SUITE = Path(__file__).parent / "evals" / "agent_tasks_v0_1.json"
STATUSES = {"pass", "fail", "blocked", "not_run"}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_suite(suite: dict) -> None:
    tasks = suite.get("tasks", [])
    if len(tasks) != 20:
        raise SystemExit(f"Expected 20 benchmark tasks, found {len(tasks)}")
    ids = [task.get("id") for task in tasks]
    if len(ids) != len(set(ids)):
        raise SystemExit("Benchmark task ids must be unique.")
    for task in tasks:
        if not task.get("category") or not task.get("prompt") or not task.get("success"):
            raise SystemExit(f"Incomplete task: {task.get('id')}")


def init_run(suite: dict, output: Path) -> None:
    payload = {
        "benchmark": suite["name"],
        "version": suite["version"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "results": [
            {"task_id": task["id"], "status": "not_run", "notes": "", "evidence": []}
            for task in suite["tasks"]
        ],
    }
    output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def update_result(run_path: Path, task_id: str, status: str, notes: str, evidence: list[str]) -> None:
    if status not in STATUSES:
        raise SystemExit(f"Status must be one of: {', '.join(sorted(STATUSES))}")
    run = load_json(run_path)
    for result in run["results"]:
        if result["task_id"] == task_id:
            result["status"] = status
            result["notes"] = notes
            result["evidence"] = evidence
            result["updated_at"] = datetime.now(timezone.utc).isoformat()
            break
    else:
        raise SystemExit(f"Unknown task id: {task_id}")
    run_path.write_text(json.dumps(run, indent=2) + "\n", encoding="utf-8")


def score_run(suite: dict, run: dict) -> dict:
    categories = defaultdict(lambda: {"pass": 0, "total": 0})
    task_by_id = {task["id"]: task for task in suite["tasks"]}
    passed = 0
    results = {item["task_id"]: item for item in run.get("results", [])}

    for task in suite["tasks"]:
        status = results.get(task["id"], {}).get("status", "not_run")
        ok = status == "pass"
        passed += int(ok)
        categories[task["category"]]["pass"] += int(ok)
        categories[task["category"]]["total"] += 1

    total = len(suite["tasks"])
    return {
        "passed": passed,
        "total": total,
        "score": passed / total if total else 1.0,
        "categories": dict(categories),
    }


def main() -> int:
    parser = argparse.ArgumentParser(prog="ai-lab")
    parser.add_argument("--suite", type=Path, default=DEFAULT_SUITE)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list")

    p = sub.add_parser("init")
    p.add_argument("run", type=Path)

    p = sub.add_parser("record")
    p.add_argument("run", type=Path)
    p.add_argument("task_id")
    p.add_argument("status", choices=sorted(STATUSES))
    p.add_argument("--notes", default="")
    p.add_argument("--evidence", action="append", default=[])

    p = sub.add_parser("score")
    p.add_argument("run", type=Path)

    args = parser.parse_args()
    suite = load_json(args.suite)
    validate_suite(suite)

    if args.command == "list":
        for task in suite["tasks"]:
            print(f"{task['id']}\t{task['category']}\t{task['prompt']}")
    elif args.command == "init":
        init_run(suite, args.run)
        print(args.run)
    elif args.command == "record":
        update_result(args.run, args.task_id, args.status, args.notes, args.evidence)
    elif args.command == "score":
        print(json.dumps(score_run(suite, load_json(args.run)), indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
