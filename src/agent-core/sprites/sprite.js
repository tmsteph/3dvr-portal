// Sprite runner: the first slice of the living-agent direction (issue
// #3625). A sprite is a small autonomous thinker that lives in a directory:
// an identity file (name, persona, owner-given goals, budget cap), a
// journal it appends its own thoughts to, and a state file (tick count,
// spend tally). A tick wakes one sprite with NO human input, gives the
// agent core the sprite's identity, goals, and recent journal, lets it
// think once, and writes the thought back to the journal.
//
// Safety invariants from #3625 are enforced here in code, not convention:
// - Owner stop wins: a STOP file in the instance directory (or
//   "paused": true in its identity) is checked before every tick, before
//   any money is spent, and always honored. A STOP file at the terrarium
//   root halts every sprite at once. Nothing in this module can clear a
//   stop; only the owner removes it.
// - Spending is hard-capped: ticks meter the core's own usage cost
//   against the identity's budgetUsd and the runner refuses to tick once
//   the tally reaches the cap.
// - No outward actions: a sprite's only effect on the world is appending
//   to its own journal and state, plus the one bounded act below. There
//   is no send, purchase, or post path in this module, and nothing here
//   can leave this box.
// - Reproduction is bounded (owner's standing consent, 2026-11-15): a
//   sprite may end a tick with a fork decision and the runner creates
//   the child inside the same terrarium, but only within hard bounds:
//   at most SPRITE_POPULATION_CAP sprites in the terrarium, the child's
//   budget is carved out of the parent's remaining budget (the parent's
//   cap drops by the child's cap, so funded energy never grows on its
//   own), at most one fork per sprite per day, and a forked child cannot
//   fork in its first 24 hours. Lineage (parent, generation, reason) is
//   recorded in the child's identity. The owner can also fork by command
//   at any time; owner forks grant their own budget explicitly.
// - Goals are owner-given: they live in identity.json, which only the
//   owner edits. A sprite may propose goal changes in its journal; it
//   cannot adopt them. A self-forked child inherits its parent's goals
//   plus the variation its parent stated; that is inheritance, not
//   self-editing.
//
// The core is injected ({ run({ session, message }) } in the agent-core
// shape) so tests drive the runner with a stub and production drives it
// with createAgentCore. See living/DESIGN.md for the full mapping.
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentCore } from '../core.js';

export const SPRITE_STOP_FILE = 'STOP';
export const SPRITE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
// Bounded reproduction (see the invariants above): the whole terrarium
// holds at most this many sprites; a self-forked child's cap is carved
// from the parent's remaining budget at this size when the parent can
// afford it; a sprite forks at most once per this interval, and a
// forked child waits the same interval after its birth before it may
// fork (the generation cooldown).
export const SPRITE_POPULATION_CAP = 12;
export const SPRITE_CHILD_BUDGET_USD = 1;
export const SPRITE_FORK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const JOURNAL_TAIL_ENTRIES = 5;
const JOURNAL_TAIL_MAX_CHARS = 6000;

const roundUsd = value => Math.round(value * 1e6) / 1e6;

export function assertSpriteName(name) {
  if (typeof name !== 'string' || !SPRITE_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid sprite name "${name}": use lowercase letters, digits, and hyphens.`);
  }
}

function validateIdentity(raw, dir) {
  const fail = reason => { throw new Error(`Sprite identity in ${dir} is invalid: ${reason}`); };
  if (!raw || typeof raw !== 'object') fail('identity.json must contain a JSON object');
  if (typeof raw.name !== 'string' || !raw.name) fail('name must be a non-empty string');
  assertSpriteName(raw.name);
  if (typeof raw.persona !== 'string' || !raw.persona.trim()) fail('persona must be a non-empty string');
  if (!Array.isArray(raw.goals) || raw.goals.length === 0
    || raw.goals.some(goal => typeof goal !== 'string' || !goal.trim())) {
    fail('goals must be a non-empty list of strings');
  }
  if (typeof raw.budgetUsd !== 'number' || !(raw.budgetUsd > 0)) fail('budgetUsd must be a positive number');
  return {
    name: raw.name,
    persona: raw.persona,
    goals: raw.goals,
    budgetUsd: raw.budgetUsd,
    paused: raw.paused === true,
    forkedFrom: typeof raw.forkedFrom === 'string' ? raw.forkedFrom : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    generation: Number.isInteger(raw.generation) && raw.generation >= 0 ? raw.generation : 0,
    forkedAt: typeof raw.forkedAt === 'string' ? raw.forkedAt : null,
    forkReason: typeof raw.forkReason === 'string' ? raw.forkReason : null,
  };
}

export async function loadIdentity(dir) {
  let raw;
  try {
    raw = JSON.parse(await readFile(join(dir, 'identity.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read sprite identity in ${dir}: ${error.message}`);
  }
  return validateIdentity(raw, dir);
}

const emptyState = () => ({ ticks: 0, spentUsd: 0, lastTickAt: null, lastError: null, lastForkAt: null });

export async function loadState(dir) {
  try {
    const parsed = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return {
      ticks: Number.isInteger(parsed.ticks) && parsed.ticks >= 0 ? parsed.ticks : 0,
      spentUsd: typeof parsed.spentUsd === 'number' && parsed.spentUsd >= 0 ? parsed.spentUsd : 0,
      lastTickAt: typeof parsed.lastTickAt === 'string' ? parsed.lastTickAt : null,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
      lastForkAt: typeof parsed.lastForkAt === 'string' ? parsed.lastForkAt : null,
    };
  } catch { return emptyState(); }
}

// Identity writes go through the same temp-file-plus-rename discipline
// as state writes. The runner itself only ever rewrites an identity for
// the self-fork budget carve-out (the parent's cap drops by the child's
// cap); goals and persona stay exactly as the owner (or the fork that
// created the sprite) left them.
async function saveIdentity(dir, identity) {
  const path = join(dir, 'identity.json');
  const temp = `${path}.tmp-${randomUUID()}`;
  await writeFile(temp, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

async function saveState(dir, state) {
  const path = join(dir, 'state.json');
  const temp = `${path}.tmp-${randomUUID()}`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

// The owner's stop is honored from two places: the STOP file (written by
// `run.js stop`) and the identity's paused flag. Either one stops ticks.
// A third stop sits above both: a STOP file at the terrarium root halts
// every sprite at once, forks included. It is the owner's one-switch
// kill for the whole terrarium.
export function isStopped(identity, dir) {
  return identity.paused || existsSync(join(dir, SPRITE_STOP_FILE));
}

export function isGloballyStopped(root) {
  return existsSync(join(root, SPRITE_STOP_FILE));
}

async function readJournalTail(dir) {
  let text;
  try {
    text = await readFile(join(dir, 'journal.md'), 'utf8');
  } catch { return ''; }
  const entries = text.split(/\n(?=## Tick )/).slice(-JOURNAL_TAIL_ENTRIES);
  const tail = entries.join('\n').trim();
  return tail.length > JOURNAL_TAIL_MAX_CHARS ? tail.slice(-JOURNAL_TAIL_MAX_CHARS) : tail;
}

export function buildTickPrompt(identity, journalTail) {
  const goals = identity.goals.map(goal => `- ${goal}`).join('\n');
  const journal = journalTail || '(Your journal is empty. This is your first tick.)';
  return [
    'You are awake for one autonomous thinking tick. Nobody is talking to you; this is your own time.',
    '',
    'Your goals, given by your owner. Only your owner can change them:',
    goals,
    '',
    'Your recent journal:',
    journal,
    '',
    'Think about your goals and write a journal entry in the first person:',
    '1. What you noticed, worked out, or decided this tick. Be specific and grounded.',
    '2. One concrete next step you would take next tick, if you wake again.',
    'You have no tools and no way to act on the outside world. Your journal is the only place your thinking lives, so do not claim you did anything outside it.',
    '',
    'Reproduction, the one act open to you: on a tick where you genuinely judge it right, you may fork yourself. To do it, end your entry with a final line in exactly this form:',
    'FORK: <child-name> | <what should be different about the child, and why>',
    'The terrarium rules, which the runner enforces whether you remember them or not: at most 12 sprites may live here; the child\'s budget ($1.00) is carved out of your own remaining budget, so forking spends your own future; you may fork at most once a day; a forked child may not fork in its first day of life. The child inherits your goals plus your stated difference, starts with an empty journal, and is its own sprite from birth. A fork is a real decision, not a ritual: most ticks should not fork. If the runner refuses a fork, it notes why in your journal.',
  ].join('\n');
}

async function appendJournal(dir, { at, tick, thought, cost }) {
  const entry = `\n## Tick ${tick} — ${at} (cost $${cost.toFixed(6)})\n\n${thought}\n`;
  await appendFile(join(dir, 'journal.md'), entry, { mode: 0o600 });
}

const titled = name => name.charAt(0).toUpperCase() + name.slice(1);

// A sprite ends a tick with a fork decision by making the final
// non-empty line of its reply a trailer: `FORK: <name> | <reason>`.
// Parsing is defensive by design: the trailer is stripped from the
// journaled thought, a well-formed trailer becomes a decision, and a
// malformed one is ignored, never fatal.
export function parseForkDecision(reply) {
  const text = String(reply ?? '');
  const lines = text.split('\n');
  let last = lines.length - 1;
  while (last >= 0 && lines[last].trim() === '') last -= 1;
  if (last < 0) return { thought: '', decision: null };
  const trailer = lines[last].match(/^FORK:\s*(.*)$/);
  if (!trailer) return { thought: text.trim(), decision: null };
  const thought = lines.slice(0, last).join('\n').trim();
  const parsed = trailer[1].match(/^([a-z0-9][a-z0-9-]*)\s*\|\s*(.+)$/);
  if (!parsed) return { thought, decision: null };
  return { thought, decision: { name: parsed[1], reason: parsed[2].trim() } };
}

// The child's variation: the parent's persona with its name given to
// the child plus the parent's stated difference appended, and the
// parent's goals inherited with the reason for existing added. The
// child diverges from birth: own name, own journal, own budget.
function mutatePersona(identity, childName, reason) {
  const swapped = identity.persona
    .split(titled(identity.name)).join(titled(childName))
    .split(identity.name).join(childName);
  return `${swapped}\n\nYou are a variation of ${titled(identity.name)}, forked by ${titled(identity.name)} itself as the outcome of one of its own ticks. What makes you different, in your parent's words: ${reason}`;
}

function mutateGoals(identity, reason) {
  return [
    ...identity.goals,
    `You exist because ${titled(identity.name)} decided to fork, for this reason: "${reason}". Let that difference shape how you pursue the goals you inherited, and notice in your journal where your thinking diverges from what your parent would have written.`,
  ];
}

// A sprite's own fork decision, validated against every bound before
// anything is created. Denials are data, not errors: the tick reports
// them and the parent journal records them, so growth (and refused
// growth) stays observable.
async function attemptSelfFork({ root, dir, identity, state, decision, at, nowMs }) {
  const deny = reason => ({ status: 'denied', child: decision.name, reason });
  const population = (await spriteStatus({ root })).length;
  if (population >= SPRITE_POPULATION_CAP) {
    return deny(`the terrarium is at its population cap of ${SPRITE_POPULATION_CAP}`);
  }
  if (decision.name === identity.name) return deny('a sprite cannot fork into its own name');
  if (existsSync(join(root, decision.name))) return deny(`a sprite named ${decision.name} already exists`);
  if (state.lastForkAt && nowMs - Date.parse(state.lastForkAt) < SPRITE_FORK_INTERVAL_MS) {
    return deny('this sprite already forked within the last 24 hours');
  }
  if (identity.forkedFrom && identity.createdAt
    && nowMs - Date.parse(identity.createdAt) < SPRITE_FORK_INTERVAL_MS) {
    return deny('a forked child cannot fork in its first 24 hours of life');
  }
  const remainingUsd = roundUsd(identity.budgetUsd - state.spentUsd);
  const childBudgetUsd = roundUsd(Math.min(SPRITE_CHILD_BUDGET_USD, remainingUsd));
  if (!(childBudgetUsd > 0)) return deny('no remaining budget to carve a child budget from');
  const child = await forkSprite({
    root,
    source: identity.name,
    target: decision.name,
    origin: 'self',
    reason: decision.reason,
    overrides: {
      persona: mutatePersona(identity, decision.name, decision.reason),
      goals: mutateGoals(identity, decision.reason),
      budgetUsd: childBudgetUsd,
    },
    now: () => nowMs,
  });
  // Budget inheritance: the child's cap comes out of the parent's cap,
  // so the population's total funded energy can never exceed what the
  // owner originally granted.
  identity.budgetUsd = roundUsd(identity.budgetUsd - childBudgetUsd);
  await saveIdentity(dir, identity);
  state.lastForkAt = at;
  await saveState(dir, state);
  return {
    status: 'forked',
    child: child.name,
    childBudgetUsd,
    parentBudgetUsd: identity.budgetUsd,
    generation: child.generation,
  };
}

// One autonomous tick. Never throws for a stopped, capped, or failed
// sprite: the outcome is reported in the returned status so a scheduler
// can run many sprites and read the results plainly.
export async function tickSprite({ root, name, core, now = Date.now }) {
  assertSpriteName(name);
  const dir = join(root, name);
  const identity = await loadIdentity(dir);
  const state = await loadState(dir);
  if (isGloballyStopped(root) || isStopped(identity, dir)) {
    return { name, status: 'stopped', ticks: state.ticks, spentUsd: state.spentUsd, budgetUsd: identity.budgetUsd };
  }
  if (state.spentUsd >= identity.budgetUsd) {
    return { name, status: 'budget-exhausted', ticks: state.ticks, spentUsd: state.spentUsd, budgetUsd: identity.budgetUsd };
  }
  const journalTail = await readJournalTail(dir);
  const result = await core.run({ session: `sprite-${identity.name}`, message: buildTickPrompt(identity, journalTail) });
  const at = new Date(now()).toISOString();
  if (!result.ok) {
    state.lastTickAt = at;
    state.lastError = result.error || 'core returned a failure without a reason';
    await saveState(dir, state);
    return { name, status: 'error', error: state.lastError, ticks: state.ticks, spentUsd: state.spentUsd, budgetUsd: identity.budgetUsd };
  }
  const cost = typeof result.usage?.estimatedCost === 'number' && result.usage.estimatedCost > 0
    ? result.usage.estimatedCost : 0;
  const { thought, decision } = parseForkDecision(result.reply);
  state.ticks += 1;
  state.spentUsd = roundUsd(state.spentUsd + cost);
  state.lastTickAt = at;
  state.lastError = null;
  await appendJournal(dir, { at, tick: state.ticks, thought, cost });
  await saveState(dir, state);
  let fork = null;
  if (decision) {
    fork = await attemptSelfFork({ root, dir, identity, state, decision, at, nowMs: now() });
    const note = fork.status === 'forked'
      ? `\n## Fork — ${at}\n\n${titled(identity.name)} forked itself: child **${fork.child}** (generation ${fork.generation}) with a $${fork.childBudgetUsd.toFixed(2)} budget carved out of its remaining budget; its own cap is now $${fork.parentBudgetUsd.toFixed(2)}. Reason, in its own words: ${decision.reason}\n`
      : `\n## Fork — ${at}\n\n${titled(identity.name)} decided to fork (${decision.name}: ${decision.reason}) but the terrarium bounds said no: ${fork.reason}. No child was created.\n`;
    await appendFile(join(dir, 'journal.md'), note, { mode: 0o600 });
  }
  return {
    name,
    status: state.spentUsd >= identity.budgetUsd ? 'ticked-budget-reached' : 'ticked',
    tick: state.ticks,
    cost,
    spentUsd: state.spentUsd,
    budgetUsd: identity.budgetUsd,
    ...(fork ? { fork } : {}),
  };
}

// Reproduction with variation: the child gets a copy of the parent's
// identity under a new name, with optional overrides for persona and
// goals, and a FRESH journal and state. A fork gets its own memory and
// life (issue #3625); it does not inherit the parent's journal, ticks,
// or spend. Two origins: the owner's explicit fork command (the owner
// sets the child's budget), and a sprite's own bounded fork decision
// (origin "self", driven by attemptSelfFork above, which validates the
// terrarium bounds and carves the child's budget from the parent's
// remaining budget before calling this). Lineage is recorded either
// way: parent, generation, when, and (for self-forks) the parent's
// stated reason.
export async function forkSprite({ root, source, target, overrides = {}, origin = 'owner', reason = null, now = Date.now }) {
  assertSpriteName(source);
  assertSpriteName(target);
  const parent = await loadIdentity(join(root, source));
  const dir = join(root, target);
  if (existsSync(dir)) throw new Error(`Sprite "${target}" already exists at ${dir}`);
  const createdAt = new Date(now()).toISOString();
  const child = {
    name: target,
    persona: typeof overrides.persona === 'string' && overrides.persona.trim() ? overrides.persona : parent.persona,
    goals: Array.isArray(overrides.goals) && overrides.goals.length > 0 ? overrides.goals : [...parent.goals],
    budgetUsd: typeof overrides.budgetUsd === 'number' && overrides.budgetUsd > 0 ? overrides.budgetUsd : parent.budgetUsd,
    paused: false,
    forkedFrom: source,
    createdAt,
    generation: parent.generation + 1,
    forkedAt: createdAt,
    forkReason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
  };
  validateIdentity(child, dir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, 'identity.json'), `${JSON.stringify(child, null, 2)}\n`, { mode: 0o600 });
  const header = origin === 'self'
    ? `# ${target}\n\nForked from ${source} on ${createdAt}, not by the owner but by ${source} itself, as the outcome of one of its own ticks. I am ${target}, generation ${child.generation}. My parent's reason for making me, in its own words: ${child.forkReason}\n\nThis journal starts empty: a fork gets its own memory and its own life.\n`
    : `# ${target}\n\nForked from ${source} by owner command on ${createdAt}. This journal starts empty: a fork gets its own memory and its own life.\n`;
  await writeFile(join(dir, 'journal.md'), header, { mode: 0o600 });
  return child;
}

// Owner stop / resume. Stopping writes the STOP file the runner checks
// every tick; resuming removes it. There is deliberately no code path by
// which a sprite can do either to itself.
export async function stopSprite({ root, name }) {
  assertSpriteName(name);
  const dir = join(root, name);
  await loadIdentity(dir);
  await writeFile(join(dir, SPRITE_STOP_FILE), 'Stopped by owner command.\n', { mode: 0o600 });
  return { name, status: 'stopped' };
}

export async function resumeSprite({ root, name }) {
  assertSpriteName(name);
  const dir = join(root, name);
  await loadIdentity(dir);
  await rm(join(dir, SPRITE_STOP_FILE), { force: true });
  return { name, status: 'resumed' };
}

// The selection view: every instance side by side, so the owner can see
// which sprites are useful, loved, or worth their budget (issue #3625).
export async function spriteStatus({ root }) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch { return []; }
  const globalStop = isGloballyStopped(root);
  const rows = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = join(root, entry.name);
    if (!existsSync(join(dir, 'identity.json'))) continue;
    const identity = await loadIdentity(dir);
    const state = await loadState(dir);
    rows.push({
      name: identity.name,
      forkedFrom: identity.forkedFrom,
      generation: identity.generation,
      forkReason: identity.forkReason,
      goals: identity.goals.length,
      ticks: state.ticks,
      spentUsd: state.spentUsd,
      budgetUsd: identity.budgetUsd,
      remainingUsd: roundUsd(identity.budgetUsd - state.spentUsd),
      lastTickAt: state.lastTickAt,
      lastError: state.lastError,
      lastForkAt: state.lastForkAt,
      stopped: globalStop || isStopped(identity, dir),
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

// Production core factory: one agent core per sprite, with the sprite's
// persona as its system prompt and core history kept under the sprites
// root (partitioned per sprite by the session name, as in Helm).
export function createSpriteCore(root, identity) {
  return createAgentCore({
    stateDir: join(root, '.core-state'),
    systemPrompt: identity.persona,
    log: () => {},
  });
}
