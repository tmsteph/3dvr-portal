#!/usr/bin/env python3
import json, subprocess, sys, shutil, time
from pathlib import Path

REPO = Path.home() / "3dvr-site"
URL = "http://127.0.0.1:8080/completion"

def say(msg):
    print(f"[self-yolo] {msg}", flush=True)

def rule(title=""):
    bar = "=" * 56
    if title:
        print(f"\n{bar}\n{title}\n{bar}", flush=True)
    else:
        print(f"\n{bar}", flush=True)

def ensure_server():
    chk = subprocess.run(["pgrep", "-f", "llama-server"], capture_output=True, text=True)
    if chk.returncode == 0:
        say("llama-server already running")
        return
    say("starting llama-server...")
    subprocess.Popen(
        [
            str(Path.home() / "llama.cpp" / "build" / "bin" / "llama-server"),
            "-hf", "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M",
            "--host", "127.0.0.1",
            "--port", "8080",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(5)
    say("llama-server started")

def clean_html(text):
    text = text.replace("```html", "").replace("```", "")
    lower = text.lower()
    i = lower.find("<!doctype html>")
    if i != -1:
        text = text[i:]
        lower = text.lower()
    if "</html>" not in lower:
        text += "\n</html>"
    j = text.lower().find("</html>")
    if j != -1:
        text = text[:j+7]
    return text.strip() + "\n"

def main():
    if len(sys.argv) == 2:
        target = "index.html"
        task = sys.argv[1]
    elif len(sys.argv) >= 3:
        target = sys.argv[1]
        task = sys.argv[2]
    else:
        print('Usage: self-yolo.py [file] "task"')
        sys.exit(1)

    ensure_server()

    path = REPO / target
    say(f"target: {target}")
    say("reading current file...")
    orig = path.read_text(encoding="utf-8")

    prompt = f"""Rewrite this file based on the task.

Task: {task}

Return ONLY the full final file contents.
Do not use markdown fences.
Do not explain.
Keep it complete and valid.

FILE:
{orig}
"""

    payload = {
        "prompt": prompt,
        "n_predict": 1200,
        "temperature": 0.2,
        "stop": ["</html>"],
        "stream": True,
    }

    rule("MODEL OUTPUT")
    proc = subprocess.Popen(
        ["curl", "-N", "-s", URL, "-H", "Content-Type: application/json", "-d", json.dumps(payload)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    parts = []
    for line in proc.stdout:
        if not line.startswith("data: "):
            continue
        chunk = line[6:].strip()
        if not chunk or chunk == "[DONE]":
            continue
        try:
            data = json.loads(chunk)
        except json.JSONDecodeError:
            continue
        text = data.get("content", "")
        if text:
            print(text, end="", flush=True)
            parts.append(text)

    proc.wait()
    print()
    rule("POST-PROCESS")

    out = clean_html("".join(parts))
    tmp = path.with_suffix(".new")
    say("writing temp file...")
    tmp.write_text(out, encoding="utf-8")

    if tmp.stat().st_size > 0:
        say("replacing target file...")
        shutil.move(tmp, path)
        say("committing changes...")
        subprocess.run(["git", "add", target], cwd=REPO)
        subprocess.run(["git", "commit", "-m", "self-yolo update"], cwd=REPO)
        rule("DONE")
        say(f"updated: {target}")
    else:
        say("failed: empty output")
        sys.exit(2)

if __name__ == "__main__":
    main()
