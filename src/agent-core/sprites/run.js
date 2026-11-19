#!/usr/bin/env node
// Sprite CLI: the owner's hands for the sprite runner (sprite.js).
//
//   node run.js tick <name>            wake one sprite for a single tick
//   node run.js tick --all             wake every sprite once
//   node run.js status [--json]        side-by-side selection view
//   node run.js fork <source> <name> [--persona "..."] [--goal "..."]...
//   node run.js stop <name>            owner stop: no tick will run
//   node run.js resume <name>          lift an owner stop
//
// The sprites root defaults to ./instances next to this file and can be
// pointed elsewhere with --root <dir> or THREEDVR_SPRITES_DIR. Ticks use
// the real agent core (DeepInfra key via the secrets broker); a tick is
// refused, not faked, when the key path is unavailable.
//
// A sprite may also fork itself at the end of a tick (bounded: see
// sprite.js). A STOP file placed in the root itself halts every sprite
// in the terrarium at once; the per-sprite stop above halts just one.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSpriteCore, forkSprite, loadIdentity, resumeSprite, spriteStatus, stopSprite, tickSprite } from './sprite.js';

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'instances');

function parseArgs(argv) {
  const args = { positional: [], goals: [], json: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') args.root = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--persona') args.persona = argv[++i];
    else if (arg === '--goal') args.goals.push(argv[++i]);
    else if (arg === '--budget') args.budgetUsd = Number.parseFloat(argv[++i]);
    else args.positional.push(arg);
  }
  return args;
}

function printStatus(rows) {
  if (rows.length === 0) {
    console.log('No sprites found.');
    return;
  }
  for (const row of rows) {
    const state = row.stopped ? 'STOPPED' : 'awake-able';
    const last = row.lastTickAt || 'never ticked';
    const lineage = row.forkedFrom
      ? `gen ${row.generation}, forked from ${row.forkedFrom}`
      : `gen ${row.generation}`;
    console.log(`${row.name}: ${row.ticks} ticks, $${row.spentUsd.toFixed(4)} of $${row.budgetUsd.toFixed(2)} spent, last tick ${last}, ${state} (${lineage})`);
    if (row.lastError) console.log(`  last error: ${row.lastError}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command, ...rest] = args.positional;
  const root = args.root || process.env.THREEDVR_SPRITES_DIR || DEFAULT_ROOT;

  if (command === 'tick') {
    let names = rest;
    if (args.all) names = (await spriteStatus({ root })).map(row => row.name);
    if (names.length === 0) throw new Error('Name a sprite to tick, or pass --all.');
    for (const name of names) {
      const identity = await loadIdentity(join(root, name));
      const core = createSpriteCore(root, identity);
      const result = await tickSprite({ root, name, core });
      console.log(JSON.stringify(result));
    }
    return;
  }
  if (command === 'status') {
    const rows = await spriteStatus({ root });
    if (args.json) console.log(JSON.stringify(rows, null, 2));
    else printStatus(rows);
    return;
  }
  if (command === 'fork') {
    const [source, target] = rest;
    if (!source || !target) throw new Error('Usage: run.js fork <source> <new-name>');
    const child = await forkSprite({
      root,
      source,
      target,
      overrides: { persona: args.persona, goals: args.goals, budgetUsd: args.budgetUsd },
    });
    console.log(`Forked ${source} -> ${child.name}. Edit ${join(root, target, 'identity.json')} to vary its persona or goals.`);
    return;
  }
  if (command === 'stop' || command === 'resume') {
    const [name] = rest;
    if (!name) throw new Error(`Usage: run.js ${command} <name>`);
    const result = command === 'stop' ? await stopSprite({ root, name }) : await resumeSprite({ root, name });
    console.log(JSON.stringify(result));
    return;
  }
  console.log('Usage: run.js <tick|status|fork|stop|resume> [name] [--root dir] [--all] [--json]');
  process.exitCode = command ? 1 : 0;
}

main().catch(error => {
  console.error(`sprites: ${error.message}`);
  process.exitCode = 1;
});
