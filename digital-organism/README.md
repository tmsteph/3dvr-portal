# Digital Organism

The canonical home for Digital Organism is now the 3DVR Portal monorepo.

- `index.html` is the user-facing Portal surface.
- `runtime/` contains the Python continual-memory runtime, provider adapters, tests, evaluation fixtures, examples, and architecture notes.
- `../brain/` is the open, human-facing Markdown workspace: local files, wikilinks, backlinks, search, and MOCs.
- New product integration and runtime development should land here together.

The former `tmsteph/3dvr-digital-organism` repository is retained as project history and as the source of the initial runtime import.

## Brain boundary

3DVR Brain and Digital Organism deliberately solve different layers of the same
problem:

- **Brain** keeps knowledge inspectable and portable as ordinary Markdown.
- **Digital Organism** keeps durable memory, provenance, revisions, retrieval,
  evaluation, and model-provider boundaries.

The source notes should remain useful without 3DVR software, a hosted service, or
a particular model. Derived indexes can always be rebuilt.

See [`../brain/README.md`](../brain/README.md).

## Test the runtime

```bash
cd digital-organism/runtime
python3 -m unittest -q
```
