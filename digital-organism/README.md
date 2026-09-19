# Digital Organism

The canonical home for Digital Organism is now the 3DVR Portal monorepo.

- `index.html` is the user-facing Portal surface.
- `runtime/` contains the Python continual-memory runtime, provider adapters, tests, evaluation fixtures, examples, and architecture notes.
- New product integration and runtime development should land here together.

The former `tmsteph/3dvr-digital-organism` repository is retained as project history and as the source of the initial runtime import.

## Test the runtime

```bash
cd digital-organism/runtime
python3 -m unittest -q
```
