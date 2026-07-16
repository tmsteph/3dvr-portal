#!/usr/bin/env python3
import json, subprocess, sys, shutil, time
from pathlib import Path

REPO = Path.home() / "3dvr-agent"
URL = "http://127.0.0.1:8080/completion"

ALLOWED = {
    "self_yolo/cli.py",
    "self_yolo/yolo_app.py",
    "self_yolo/yolo_new_site.py",
    "self_yolo/self_update_agent.py",
    "self_yolo/self_yolo_agent.py",
    "self_yolo/self_yolo_loop.py",
    "self_yolo/rollback.py",
    "pyproject.toml",
    "README.md",
}

def say(msg):
    print(f"[self-yolo-agent] {msg}", flush=True)

def rule(title=""):
    bar = "=" * 56
    print(f"\n{bar}\n{title}\n{bar}", flush=True)

def ensure_server():
    chk = subprocess.run(["pgrep", "-f", "llama-server"], capture_output=True, text=True)
    if chk.returncode != 0:
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

    say("waiting for llama-server health...")
    for i in range(30):
        health = subprocess.run(
            ["curl", "-s", "http://127.0.0.1:8080/health"],
            capture_output=True, text=True
        )
        if health.returncode == 0 and health.stdout.strip():
            say("llama-server ready")
            return
        time.sleep(1)

    print("[self-yolo-agent] llama-server did not become ready in time")
    sys.exit(10)

def dedupe_markdown_sections(text):
    lines = text.splitlines()
    out = []
    seen_blocks = set()
    block = []

    def flush_block():
        nonlocal block
        if not block:
            return
        joined = "\n".join(block).strip()
        key = joined[:400]
        if joined and key not in seen_blocks:
            seen_blocks.add(key)
            out.extend(block)
            out.append("")
        block = []

    for line in lines:
        if line.strip() == "---" or line.startswith("# "):
            flush_block()
        block.append(line)
    flush_block()
    return "\n".join(out).strip() + "\n"


def extract_markdown_section(text, section_name):
    lines = text.splitlines()
    target = section_name.strip().lower()
    start = None
    end = None

    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("## ") and stripped[3:].strip().lower() == target:
            start = i
            continue
        if start is not None and stripped.startswith("## "):
            end = i
            break

    if start is None:
        return None, None, None

    if end is None:
        end = len(lines)

    before = "\n".join(lines[:start]).rstrip()
    section = "\n".join(lines[start:end]).strip()
    after = "\n".join(lines[end:]).lstrip()
    return before, section, after

def clean_text(text):
    text = (
        text.replace("```python", "")
            .replace("```toml", "")
            .replace("```md", "")
            .replace("```html", "")
            .replace("```bash", "")
            .replace("```", "")
            .replace("-----BEGIN SOLUTION-----", "")
            .replace("-----END SOLUTION-----", "")
            .replace("-----BEGIN SECTION-----", "")
            .replace("-----END SECTION-----", "")
    )

    lines = []
    for line in text.splitlines():
        if line.strip() == "bash":
            continue
        lines.append(line)

    return "\n".join(lines).strip() + "\n"

def main():
    preview = False
    args = sys.argv[1:]
    if args and args[0] in ("--preview", "-p"):
        preview = True
        args = args[1:]

    if len(args) == 1:
        target = "README.md"
        task = args[0]
    elif len(args) >= 2:
        target = args[0]
        task = args[1]
    else:
        print('Usage: self-yolo-agent [--preview] [file] "task"')
        sys.exit(1)

    if target not in ALLOWED:
        print("Target not allowed.")
        for x in sorted(ALLOWED):
            print(" -", x)
        sys.exit(2)

    ensure_server()

    path = REPO / target
    if not path.exists():
        print(f"Target file does not exist: {path}")
        sys.exit(3)

    orig = path.read_text(encoding="utf-8")
    section_name = None
    section_before = None
    section_after = None

    if target == "README.md":
        lowered_task = task.lower()
        if "section" in lowered_task:
            markers = ["installation", "commands", "features", "usage", "notes", "license"]
            for m in markers:
                if m in lowered_task:
                    section_name = m.title()
                    break
            if section_name:
                extracted = extract_markdown_section(orig, section_name)
                if extracted[0] is None:
                    print(f"[self-yolo-agent] section not found: {section_name}")
                    sys.exit(12)
                section_before, orig, section_after = extracted
                print(f"[self-yolo-agent] editing README section: {section_name}", flush=True)


    # guard: prevent full README rewrites
    if target == "README.md":
        risky = any(x in task.lower() for x in ["rewrite", "full", "entire", "from scratch"])
        if risky or len(orig) > 800:
            print("[self-yolo-agent] blocked: full README rewrites are unreliable with this model")
            print("[self-yolo-agent] suggestion: edit a specific section instead")
            print('[self-yolo-agent] example: "Improve the Installation section clarity"')
            sys.exit(11)
    say(f"target: {target}")
    say(f"file size: {len(orig)} chars")

    if target == "README.md" and section_name:
        prompt = f"""You are editing exactly one section of README.md.

STRICT RULES:
- Return ONLY the rewritten contents of this section.
- Start with the exact heading line for this section.
- Do not output any other section.
- Do not output the whole README.
- Do not output words like markdown or code fences.
- Do not explain.
- Keep valid markdown.

Task: {task}

Section name: {section_name}

Current section contents begin below:
-----BEGIN SECTION-----
{orig}
-----END SECTION-----

Return ONLY this section.
"""
    else:
        prompt = f"""You are editing a real project file.

STRICT RULES:
- Return the FULL final contents of the file only.
- Do not describe the file.
- Do not explain your changes.
- Do not output placeholders like obj['final_file_contents'].
- Do not use markdown fences.
- Do not repeat sections.
- Keep the file valid for its file type.
- Preserve the existing purpose unless the task explicitly changes it.

Task: {task}

Target file path: {target}

Current file contents begin below:
-----BEGIN FILE-----
{orig}
-----END FILE-----

Now return ONLY the complete final file contents.
"""
    say(f"prompt size: {len(prompt)} chars")

    stream = target.endswith(".html")
    payload = {
        "prompt": prompt,
        "n_predict": 1200 if stream else 220,
        "temperature": 0.2,
        "repeat_penalty": 1.3,
        "stop": ["\n---\n# 3dvr-agent", "\n# 3dvr-agent\n# 3dvr-agent"],
        "stream": stream,
    }

    say(f"editing {target} ...")
    rule("MODEL OUTPUT")
    started = time.time()

    if not stream:
        say("using non-stream mode")
        res = subprocess.run(
            ["curl", "-s", URL, "-H", "Content-Type: application/json", "-d", json.dumps(payload)],
            capture_output=True,
            text=True,
        )
        if not res.stdout.strip():
            print("Failed: empty response")
            sys.exit(4)
        data = json.loads(res.stdout)
        out = clean_text(data.get("content", ""))
        if target.endswith(".md"):
            out = dedupe_markdown_sections(out)
        if target == "README.md" and section_name:
            pieces = []
            if section_before:
                pieces.append(section_before.rstrip())
            pieces.append(out.strip())
            if section_after:
                pieces.append(section_after.lstrip())
            out = "\n\n".join([x for x in pieces if x]).strip() + "\n"
        print(out, end="", flush=True)
        say(f"completed in {time.time() - started:.1f}s")
    else:
        proc = subprocess.Popen(
            ["curl", "-N", "-s", URL, "-H", "Content-Type: application/json", "-d", json.dumps(payload)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        parts = []
        seen_tail = set()
        first_token = None

        for line in proc.stdout:
            if time.time() - started > 45:
                print("\n[self-yolo-agent] timeout reached")
                proc.kill()
                break
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
                if first_token is None:
                    first_token = time.time()
                    say(f"first token in {first_token - started:.1f}s")
                print(text, end="", flush=True)
                parts.append(text)
                joined = "".join(parts)
                tail = joined[-400:]
                if tail in seen_tail and len(tail.strip()) > 80:
                    print("\n[self-yolo-agent] repetition detected, stopping")
                    proc.kill()
                    break
                seen_tail.add(tail)

        proc.wait()
        print()
        say(f"completed in {time.time() - started:.1f}s")
        out = clean_text("".join(parts))
        if not out.strip():
            print("Failed: empty response")
            sys.exit(4)

    rule("POST-PROCESS")

    tmp = path.with_suffix(path.suffix + ".new")
    bak = path.with_suffix(path.suffix + ".bak")
    bak.write_text(orig, encoding="utf-8")
    tmp.write_text(out, encoding="utf-8")

    if len(out.strip()) < max(120, len(orig.strip()) // 4):
        print("Validation failed: output too small.")
        sys.exit(5)

    if target.endswith(".py"):
        if "def main" not in out and "if __name__" not in out:
            print("Validation failed: missing expected python structure.")
            sys.exit(5)
        chk = subprocess.run([sys.executable, "-m", "py_compile", str(tmp)], capture_output=True, text=True)
        if chk.returncode != 0:
            print(chk.stderr or chk.stdout)
            print("Validation failed.")
            sys.exit(5)

    if out.strip() == orig.strip():
        print("No meaningful changes.")
        tmp.unlink(missing_ok=True)
        sys.exit(0)

    if preview:
        rule("DIFF PREVIEW")
        subprocess.run(["git", "--no-pager", "diff", "--no-index", "--", str(path), str(tmp)], check=False)
        ans = input("\n[self-yolo-agent] apply these changes? [y/N] ").strip().lower()
        if ans not in ("y", "yes"):
            print("[self-yolo-agent] cancelled")
            tmp.unlink(missing_ok=True)
            sys.exit(0)


    subprocess.run(["git","add","."], cwd=REPO)
    subprocess.run(["git","commit","-m","checkpoint before self-yolo-agent"], cwd=REPO, capture_output=True, text=True)

    shutil.move(tmp, path)

    if target.endswith(".py"):
        final_chk = subprocess.run([sys.executable, "-m", "py_compile", str(path)], capture_output=True, text=True)
        if final_chk.returncode != 0:
            print(final_chk.stderr or final_chk.stdout)
            print("[self-yolo-agent] final syntax check failed, restoring backup")
            if bak.exists():
                shutil.copy2(bak, path)
            sys.exit(6)

    subprocess.run(["git", "add", target], cwd=REPO)
    commit_res = subprocess.run(["git", "commit", "-m", f"self-yolo-agent: improve {target}"], cwd=REPO, capture_output=True, text=True)
    if commit_res.returncode != 0:
        print(commit_res.stdout or commit_res.stderr)
        print("[self-yolo-agent] commit failed, restoring backup")
        if bak.exists():
            shutil.copy2(bak, path)
        sys.exit(7)

    push_res = subprocess.run(["git", "push"], cwd=REPO, capture_output=True, text=True)
    if push_res.returncode != 0:
        print(push_res.stdout or push_res.stderr)
        print("[self-yolo-agent] push failed, restoring backup")
        if bak.exists():
            shutil.copy2(bak, path)
        sys.exit(8)

    reinstall_res = subprocess.run(["pip", "install", "--break-system-packages", "-e", str(REPO)], capture_output=True, text=True)
    if reinstall_res.returncode != 0:
        print(reinstall_res.stdout or reinstall_res.stderr)
        print("[self-yolo-agent] reinstall failed, restoring backup")
        if bak.exists():
            shutil.copy2(bak, path)
        sys.exit(9)

    rule("DONE")
    say(f"updated {target}")

if __name__ == "__main__":
    main()
