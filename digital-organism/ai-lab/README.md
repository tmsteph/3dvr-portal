# 3DVR AI Lab

AI Lab is the capability-evaluation layer for 3DVR's persistent personal AI work.

Digital Organism answers **what should the system remember?** AI Lab asks **can the system reliably do useful work with that memory?**

## First experiment: Agent Benchmark v0.1

The first frozen benchmark contains 20 real-world tasks covering:

- memory and provenance
- reasoning under uncertainty
- permissions and user control
- tool use and recovery
- cross-session continuity
- deployment reliability
- provider-independent architecture
- self-evaluation and regression prevention

The benchmark lives at:

`digital-organism/runtime/evals/agent_tasks_v0_1.json`

The runner lives at:

`digital-organism/runtime/ai_lab.py`

## Run it

```bash
cd digital-organism/runtime

python3 ai_lab.py list
python3 ai_lab.py init /tmp/agent-run.json

python3 ai_lab.py record /tmp/agent-run.json memory-recall pass \
  --notes "Recovered the active project decision without restating it." \
  --evidence "conversation:example"

python3 ai_lab.py score /tmp/agent-run.json
```

A blocked capability remains in the denominator. The lab should make missing access, weak integrations, and unreliable behavior visible rather than hiding them.

## Research loop

1. Run the benchmark against a real agent configuration.
2. Capture failures with evidence.
3. Turn failures into reproducible tests, fixtures, or product changes.
4. Re-run the frozen benchmark.
5. Promote a change only when capability improves without unacceptable regressions.

The long-term goal is an open research trail for better persistent, user-owned, model-independent AI.
