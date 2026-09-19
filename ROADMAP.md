# Roadmap

## v0.1 — Remember

- [ ] Define event + memory schemas
- [ ] Import conversation JSON/JSONL
- [ ] Store raw events append-only
- [ ] Extract durable memories
- [ ] Retrieve memories for a prompt
- [ ] Show provenance and retrieval reasons
- [ ] Support corrections, superseding, and deletion
- [ ] Add basic recall/temporal evals

**Success:** ask a question in a new session and recover the right prior context without manually restating it.

## v0.2 — Connect

- [ ] Project/entity linking
- [ ] Relationship graph
- [ ] Memory importance/decay
- [ ] Conflict detection
- [ ] Connector ingestion for files/code/tasks/calendar/email
- [ ] Sync across devices/nodes

**Success:** context follows the person across tools rather than living inside individual chat products.

## v0.3 — Learn

- [ ] Build approved interaction dataset
- [ ] Redact secrets and unstable facts from training examples
- [ ] Train first LoRA/adapter on an open-weight model
- [ ] Frozen regression evaluation suite
- [ ] Candidate promotion/rollback mechanism

**Success:** training measurably improves behavior while factual memory remains editable outside the weights.

## v0.4 — Organism

- [ ] Background memory compiler
- [ ] Local worker model for cheap continuous processing
- [ ] Model routing by task/cost/privacy
- [ ] Periodic self-evaluation
- [ ] Versioned personality/workflow adapters
- [ ] Encrypted personal memory vault
- [ ] Portable export/import format

**Success:** the system keeps organizing and learning from experience while remaining inspectable, reversible, and owned by the user.

## Immediate Next Build

Create a minimal CLI:

```bash
organism ingest conversation.jsonl
organism remember "..."
organism recall "what servers are we using?"
organism explain <memory-id>
organism forget <memory-id>
organism eval
```

Start with SQLite + JSONL. Resist infrastructure complexity until the retrieval/evaluation loop works.
