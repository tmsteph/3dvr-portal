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
//   any money is spent, and always honored. Nothing in this module can
//   clear a stop; only the owner removes it.
// - Spending is hard-capped: ticks meter the core's own usage cost
//   against the identity's budgetUsd and the runner refuses to tick once
//   the tally reaches the cap.
// - No outward actions: a sprite's only effect on the world is appending
//   to its own journal and state. There is no send, purchase, post, or
//   spawn path in this module. Copying a sprite is the owner's explicit
//   fork command below, never something a sprite does itself.
// - Goals are owner-given: they live in identity.json, which only the
//   owner edits. A sprite may propose goal changes in its journal; it
//   cannot adopt them.
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

const emptyState = () => ({ ticks: 0, spentUsd: 0, lastTickAt: null, lastError: null });

export async function loadState(dir) {
  try {
    const parsed = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return {
      ticks: Number.isInteger(parsed.ticks) && parsed.ticks >= 0 ? parsed.ticks : 0,
      spentUsd: typeof parsed.spentUsd === 'number' && parsed.spentUsd >= 0 ? parsed.spentUsd : 0,
      lastTickAt: typeof parsed.lastTickAt === 'string' ? parsed.lastTickAt : null,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
    };
  } catch { return emptyState(); }
}

async function saveState(dir, state) {
  const path = join(dir, 'state.json');
  const temp = `${path}.tmp-${randomUUID()}`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

// The owner's stop is honored from two places: the STOP file (written by
// `run.js stop`) and the identity's paused flag. Either one stops ticks.
export function isStopped(identity, dir) {
  return identity.paused || existsSync(join(dir, SPRITE_STOP_FILE));
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
  ].join('\n');
}

async function appendJournal(dir, { at, tick, thought, cost }) {
  const entry = `\n## Tick ${tick} — ${at} (cost $${cost.toFixed(6)})\n\n${thought}\n`;
  await appendFile(join(dir, 'journal.md'), entry, { mode: 0o600 });
}

// One autonomous tick. Never throws for a stopped, capped, or failed
// sprite: the outcome is reported in the returned status so a scheduler
// can run many sprites and read the results plainly.
export async function tickSprite({ root, name, core, now = Date.now }) {
  assertSpriteName(name);
  const dir = join(root, name);
  const identity = await loadIdentity(dir);
  const state = await loadState(dir);
  if (isStopped(identity, dir)) {
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
  state.ticks += 1;
  state.spentUsd = roundUsd(state.spentUsd + cost);
  state.lastTickAt = at;
  state.lastError = null;
  await appendJournal(dir, { at, tick: state.ticks, thought: result.reply.trim(), cost });
  await saveState(dir, state);
  return {
    name,
    status: state.spentUsd >= identity.budgetUsd ? 'ticked-budget-reached' : 'ticked',
    tick: state.ticks,
    cost,
    spentUsd: state.spentUsd,
    budgetUsd: identity.budgetUsd,
  };
}

// Reproduction with variation, owner-commanded only: the child gets a
// copy of the parent's identity under a new name, with optional owner
// overrides for persona and goals, and a FRESH journal and state. A fork
// gets its own memory and life (issue #3625); it does not inherit the
// parent's journal, ticks, or spend.
export async function forkSprite({ root, source, target, overrides = {}, now = Date.now }) {
  assertSpriteName(source);
  assertSpriteName(target);
  const parent = await loadIdentity(join(root, source));
  const dir = join(root, target);
  if (existsSync(dir)) throw new Error(`Sprite "${target}" already exists at ${dir}`);
  const child = {
    name: target,
    persona: typeof overrides.persona === 'string' && overrides.persona.trim() ? overrides.persona : parent.persona,
    goals: Array.isArray(overrides.goals) && overrides.goals.length > 0 ? overrides.goals : [...parent.goals],
    budgetUsd: typeof overrides.budgetUsd === 'number' && overrides.budgetUsd > 0 ? overrides.budgetUsd : parent.budgetUsd,
    paused: false,
    forkedFrom: source,
    createdAt: new Date(now()).toISOString(),
  };
  validateIdentity(child, dir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, 'identity.json'), `${JSON.stringify(child, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(dir, 'journal.md'),
    `# ${target}\n\nForked from ${source} by owner command on ${child.createdAt}. This journal starts empty: a fork gets its own memory and its own life.\n`,
    { mode: 0o600 });
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
      goals: identity.goals.length,
      ticks: state.ticks,
      spentUsd: state.spentUsd,
      budgetUsd: identity.budgetUsd,
      remainingUsd: roundUsd(identity.budgetUsd - state.spentUsd),
      lastTickAt: state.lastTickAt,
      lastError: state.lastError,
      stopped: isStopped(identity, dir),
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
