#!/usr/bin/env node
// Offline, deterministic first slice of an open-source-first improvement loop.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const input = process.argv[2];
if (!input) { console.error('Usage: node scripts/frontier-lab.mjs <sanitized-events.json> [output.json]'); process.exitCode = 2; }
else {
  const events = JSON.parse(await readFile(resolve(input), 'utf8'));
  if (!Array.isArray(events) || events.some(e => !e || typeof e !== 'object' || typeof e.kind !== 'string' || typeof e.outcome !== 'string')) throw new Error('Expected array of {kind,outcome} events');
  const groups = new Map();
  for (const e of events) {
    if (!/^[a-z0-9_-]{1,64}$/i.test(e.kind) || !['success','failure'].includes(e.outcome)) throw new Error('Invalid event category/outcome');
    const g = groups.get(e.kind) ?? {kind:e.kind,total:0,failures:0};
    g.total++; if (e.outcome === 'failure') g.failures++; groups.set(e.kind,g);
  }
  const report = {schema:1,generatedFrom:'sanitized-local-events',categories:[...groups.values()].map(g=>({...g,failureRate:g.failures/g.total})).sort((a,b)=>b.failures-a.failures || a.kind.localeCompare(b.kind)),nextStep:'Reproduce top failure in isolation; inspect upstream fixes before proposing a patch',status:'baseline-only; no autonomous code changes'};
  const out = JSON.stringify(report,null,2)+'\n';
  if (process.argv[3]) { const path=resolve(process.argv[3]); await mkdir(dirname(path),{recursive:true}); await writeFile(path,out); } else process.stdout.write(out);
}
