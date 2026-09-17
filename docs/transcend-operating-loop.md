# Transcend Operating Loop

Transcend is a thin policy layer over the existing 3DVR Agent queue. It is not a new agent runtime.

Its job is simple:

```text
purpose -> candidate work -> leverage score -> safety gate -> existing task queue -> execution -> memory/audit
```

## Why

3DVR already has durable queues, worker routing, memory retrieval, risk classes, approvals, and cloud roles. The missing piece is a consistent way to choose what deserves attention next.

Transcend ranks work by purpose alignment, direct user value, revenue potential, urgency, blockers removed, reusable automation created, and effort required. It never treats an approval-gated task as eligible until approval exists.

## Safety boundary

`read_only`, `draft`, and `workspace_write` tasks may be selected automatically when the worker policy allows them.

`external_write`, `money`, and `credential` tasks require approval before the loop will select them. This preserves the user's agency while still letting the system prepare everything around the decision.

## CLI

Plan without side effects:

```bash
npm run agent:transcend -- plan --input apps/agent/thomas-agent/examples/transcend-cycle.example.json
```

Enqueue the selected task into the existing queue:

```bash
npm run agent:transcend -- enqueue --input cycle.json --queue-store sqlite
```

The input is deliberately plain JSON so Portal, Operator, Money Printer, future mobile clients, and other agents can all generate the same candidate format.

## Next integration

The next step is to have Operator and scheduled founder loops emit candidate work into this format, then write execution outcomes back into the Digital Organism. That closes the loop from purpose to action to autobiographical memory without coupling 3DVR to one model provider.
