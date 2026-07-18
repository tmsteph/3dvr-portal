# Agent Runtime State

This directory is the local durable state store for mission runs. The mutable status, append-only log, and mission JSON files are intentionally ignored by Git so recording evidence does not make the product worktree dirty or become a product commit.

The runner recreates missing state safely. Keep secrets and personal life content out of this directory.
