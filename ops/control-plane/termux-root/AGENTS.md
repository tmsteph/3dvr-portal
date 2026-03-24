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
