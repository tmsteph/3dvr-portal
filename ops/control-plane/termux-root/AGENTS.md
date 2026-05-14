# Root Codex Guidelines

## Scope
- This file is the default Codex guide for `/data/data/com.termux/files`.
- For work inside `/data/data/com.termux/files/home`, also read `/data/data/com.termux/files/home/AGENTS.md`.
- If a repo or subdirectory has its own `AGENTS.md`, the deeper file wins for repo-specific rules.

## Layout
- `home/`: primary user workspace. Most product repos and active project files live here.
- `usr/`: Termux runtime and package prefix. Do not edit it unless the task explicitly requires environment or package changes.

## Default Behavior
- Prefer working inside `home/` unless the user clearly asks for a Termux-level change.
- Avoid destructive commands and do not discard user changes.
- Keep root-level edits narrow and operational.
- When changing tools, shells, packages, or filesystem-wide config, explain the scope clearly before doing it.

## Safety
- Do not treat `/data/data/com.termux/files` as a generic scratch area.
- Be careful with commands that recurse across `home/` and `usr/`.
- Never mix project guidance from one repo into another when a deeper `AGENTS.md` exists.

## GitHub Push And Merge Auth
- Termux GitHub CLI auth is expected under `/data/data/com.termux/files/home/.config/gh/`.
- Check auth without printing secrets:
  - `HOME=/data/data/com.termux/files/home /data/data/com.termux/files/usr/bin/gh auth status`
- If a `/root` shell cannot push over HTTPS, use the Termux `gh` token as an in-memory Git credential:
  ```sh
  GITHUB_TOKEN="$(HOME=/data/data/com.termux/files/home /data/data/com.termux/files/usr/bin/gh auth token)"
  export GITHUB_TOKEN
  git -c credential.helper= \
    -c credential.helper='!f() { echo username=x-access-token; echo password=$GITHUB_TOKEN; }; f' \
    push origin BRANCH_NAME
  unset GITHUB_TOKEN
  ```
- For merges, prefer GitHub PRs through Termux `gh`; if conflicts appear, resolve them in a temporary clean worktree and push the resolved branch before merging.
