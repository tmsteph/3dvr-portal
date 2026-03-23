# Control Plane Mirror

This directory mirrors the live markdown control plane used by Codex in Termux.

## Live Source
- Home control plane: `/data/data/com.termux/files/home`
- Termux root fallback: `/data/data/com.termux/files/AGENTS.md`

## Purpose
- Keep a versioned copy of the operator docs inside this repo so the context follows across devices.
- Make Thomas Stephens' current working context visible even when the repo is cloned outside the original Termux home.
- Avoid depending on one device-local home directory as the only source of context.

## Scripts
- `sh ops/control-plane/sync-from-home.sh`
  Refresh this repo mirror from the live files in `~/`.
- `sh ops/control-plane/restore-to-home.sh`
  Restore the mirrored control plane into the current device's `~/`.

## Important
- The live source of truth is still the markdown files in `~/` when they are present.
- When both exist, prefer the live `~/` files and refresh this mirror after meaningful changes.
