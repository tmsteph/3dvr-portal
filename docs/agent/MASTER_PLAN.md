# Autonomous development master plan

Sell first. Build second. Keep it simple.

This plan defines a repo-native control loop for OpenClaw supervising bounded Codex work. A mission is a small dependency graph with deterministic checks, explicit evidence, and approval gates. Workers may return evidence and scoped changes; they may not redefine the mission.

The first proof mission is `life-upgrade-v01`:

1. inspect current state
2. merge Daily Direction privacy (satisfied from GitHub when already merged)
3. verify automatic main deployment
4. restack Life Upgrade
5. harden storage behavior
6. validate Life Upgrade
7. request Codex review
8. resolve actionable feedback
9. mark Life Upgrade ready
10. await human merge approval

The runner must stop before merge and deployment. Runtime state lives outside Git in `~/.3dvr/state/missions/<mission-id>/`; the append-only event log is authoritative and `LIVE_STATUS.md` is derived from it.
