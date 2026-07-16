#!/usr/bin/env python3
import json, subprocess, sys, time
from pathlib import Path

REPO = Path.home() / "3dvr-site"
URL = "http://127.0.0.1:8080/completion"

def say(msg):
    print(f"[yolo-app] {msg}", flush=True)

def rule(title=""):
    bar = "=" * 56
    print(f"\n{bar}\n{title}\n{bar}", flush=True)

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
    if "</html>" not in text.lower():
        text += "\n</html>"
    j = text.lower().find("</html>")
    if j != -1:
        text = text[:j+7]
    return text.strip() + "\n"

def main():
    if len(sys.argv) < 3:
        print('Usage: yolo-app "name" "prompt"')
        sys.exit(1)

    name = sys.argv[1]
    prompt = sys.argv[2]

    ensure_server()

    app_dir = REPO / "apps" / name
    app_dir.mkdir(parents=True, exist_ok=True)
    file_path = app_dir / "index.html"

    full_prompt = f"""Return ONLY valid complete HTML.
Do not use markdown fences.
Start with <!DOCTYPE html>.
End with </html>.
Use inline CSS only.
Use a dark modern design.
Do not invent broken internal links.

Page topic: {prompt}
Path: /apps/{name}
"""

    payload = {
        "prompt": full_prompt,
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
    file_path.write_text(out, encoding="utf-8")
    say(f"created {file_path}")

    subprocess.run(["git", "add", str(file_path.relative_to(REPO))], cwd=REPO)
    subprocess.run(["git", "commit", "-m", f"Add app {name}"], cwd=REPO)
    rule("DONE")
    say("pushing...")
    subprocess.run(["git", "push"], cwd=REPO)
    say("deployed via Vercel (git push)")

if __name__ == "__main__":
    main()
