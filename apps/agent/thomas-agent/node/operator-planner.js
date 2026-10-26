'use strict';

// Gate 1, Step 2: the planner service.
//
// Wiring: typed user request -> capacity gate -> model router (Step 1) ->
// OperatorCore.proposeActions -> OperatorCore.authorize. The model can only
// PROPOSE typed actions; policy in operator-core decides what may run
// (R0/R1 auto-allow, R2+ waits for approval, R4 blocked by default) and the
// core re-checks approval at execution time. This module never weakens that:
// it holds no executor of its own and delegates execution to the core.
//
// Safety rails, in order:
// 1. Config switch: the planner is OFF unless OPERATOR_PLANNER_ENABLED is
//    set (plannerFromEnv) or `enabled: true` is passed explicitly. Disabled
//    means plan()/execute() are no-ops - no capacity probe, no model call.
// 2. Capacity gate: before any model job starts, an injectable checker must
//    report enough available memory. Hetzner is 2 vCPU / ~4 GiB with a
//    history of memory pressure, so an unknown or insufficient reading
//    refuses the job cleanly instead of starting it. (The repo also has
//    scripts/ops/cloud-capacity-report.sh for mesh-wide routing reports;
//    this gate is the local, per-job admission check in front of the model.)
// 3. Fail closed: a router error (invalid JSON, hallucinated capability,
//    unknown device) produces no job and no proposals - never a partial plan.
//
// Step 3 (memory) adds two things, both inert unless a memory store is
// configured AND the planner is enabled:
// - plan() keyword-searches the owner's markdown memory files and injects
//   the relevant excerpts into the router context as background only.
// - proposeMemoryWrite() turns a "remember this" into a `memory.write`
//   action proposed through OperatorCore policy (R2, approval required)
//   carrying the exact new content and a visible diff. execute() applies
//   the write only after the core executed the approved action, and the
//   memory store re-verifies the diff against the file before writing.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createFileMemoryStore,
  MEMORY_WRITE_CAPABILITY,
} = require('./operator-memory');

const DEFAULT_MIN_AVAILABLE_MIB = 512;
const CORE_DIST = path.join(
  __dirname, '..', '..', '..', '..',
  'operator-core', 'operator-core', 'dist',
);
const DEFAULT_POLICY_PATH = path.join(
  __dirname, '..', '..', '..', '..',
  'operator-core', 'policy', 'fixtures', 'default-policy.json',
);

// Available memory in MiB from /proc/meminfo (Linux), falling back to
// os.freemem() elsewhere. Injectable via createCapacityChecker for tests.
function readAvailableMiB() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const match = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/m);
    if (match) return Math.floor(Number(match[1]) / 1024);
  } catch {
    // fall through to the portable reading
  }
  return Math.floor(os.freemem() / (1024 * 1024));
}

function createCapacityChecker({ minAvailableMiB = DEFAULT_MIN_AVAILABLE_MIB, readAvailable = readAvailableMiB } = {}) {
  return {
    minAvailableMiB,
    async check() {
      let availableMiB;
      try {
        availableMiB = await readAvailable();
      } catch {
        return {
          ok: false, availableMiB: null, minAvailableMiB,
          reason: 'capacity unknown - refusing to start a model job',
        };
      }
      if (!Number.isFinite(availableMiB)) {
        return {
          ok: false, availableMiB: null, minAvailableMiB,
          reason: 'capacity unknown - refusing to start a model job',
        };
      }
      const ok = availableMiB >= minAvailableMiB;
      return {
        ok, availableMiB, minAvailableMiB,
        reason: ok
          ? 'capacity ok'
          : `insufficient memory headroom: ${availableMiB} MiB available, ${minAvailableMiB} MiB required`,
      };
    },
  };
}

// Real router/core come from the operator-core package's compiled dist.
// Loaded lazily so a disabled planner (and the apps/agent test suite) never
// pays for - or breaks on - an unbuilt operator-core.
function loadDistModule(name) {
  try {
    return require(path.join(CORE_DIST, name));
  } catch {
    throw new Error(
      'operator-core dist not built; run `npm --prefix operator-core/operator-core run build` first',
    );
  }
}

function defaultCore() {
  const { OperatorCore } = loadDistModule('core.js');
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, 'utf8'));
  return new OperatorCore(policy);
}

function defaultRouter(env) {
  const { routerFromEnv } = loadDistModule(path.join('model', 'config.js'));
  return routerFromEnv(env);
}

/**
 * Create a planner.
 *
 * @param {object} options
 * @param {boolean} options.enabled - master config switch; default false.
 * @param {object} [options.router] - ModelRouter-shaped: propose(context)
 *   -> { proposals, provider_id }. Defaults to the Step 1 router from env.
 * @param {object} [options.core] - OperatorCore instance. Defaults to a new
 *   core loaded with the default owner policy fixture.
 * @param {object} [options.capacityChecker] - { check() -> { ok, ... } }.
 *   Defaults to the local free-memory gate.
 * @param {Array} [options.devices] - enrolled devices the planner may plan
 *   against; also handed to the router as planning context.
 * @param {object} [options.memory] - memory store (Step 3), shaped like
 *   createFileMemoryStore's return: search/format/readText/diff/
 *   applyApprovedWrite. Absent = no memory behavior at all.
 * @param {object} [options.env] - env used when building the default router.
 */
function createPlanner(options = {}) {
  const enabled = options.enabled === true;
  const capacityChecker = options.capacityChecker || createCapacityChecker();
  const devices = options.devices || [];
  const memory = options.memory || null;
  // Envelopes this planner proposed, by action_id. execute() consults this
  // to find memory.write actions among the core's receipts; the envelope
  // objects are the core's own, so any post-approval tampering changes the
  // action hash and the core denies execution before we ever see a success.
  const knownEnvelopes = new Map();
  let router = options.router || null;
  let core = options.core || null;

  function resolveRouter() {
    if (!router) router = defaultRouter(options.env || process.env);
    return router;
  }

  function resolveCore() {
    if (!core) core = defaultCore();
    return core;
  }

  return {
    enabled,

    // Plan one typed request. Returns a result object; expected failure
    // modes (disabled, capacity, bad model output) are statuses, not throws.
    async plan(request) {
      if (!enabled) return { status: 'disabled' };

      const capacity = await capacityChecker.check();
      if (!capacity.ok) return { status: 'capacity_blocked', capacity };

      const description = typeof request === 'string' ? request : request?.description;
      if (!description || typeof description !== 'string') {
        return { status: 'failed_closed', reason: 'request needs a description' };
      }
      const constraints = (typeof request === 'object' && request?.constraints) || {};

      // Memory (Step 3): relevant excerpts ride along as background context
      // in the router prompt. No store configured = no load, no search.
      let memoryHits = null;
      let memoryContext;
      if (memory) {
        memoryHits = memory.search(description);
        if (memoryHits.length > 0) memoryContext = memory.format(memoryHits);
      }

      let planResult;
      try {
        planResult = await resolveRouter().propose({
          description, devices, constraints,
          ...(memoryContext ? { memory: memoryContext } : {}),
        });
      } catch (err) {
        // Router already failed closed (no valid plan from any provider).
        return { status: 'failed_closed', reason: err instanceof Error ? err.message : String(err) };
      }

      const resolvedCore = resolveCore();
      for (const device of devices) resolvedCore.devices.enroll(device);
      const job = resolvedCore.createJob(description, devices.map((d) => d.device_id), constraints);
      const envelopes = resolvedCore.proposeActions(job.job_id, planResult.proposals);
      for (const env of envelopes) knownEnvelopes.set(env.action_id, env);
      const { approved, needsApproval, denied } = resolvedCore.authorize(job.job_id);
      return {
        status: 'planned',
        job_id: job.job_id,
        provider_id: planResult.provider_id,
        proposals: planResult.proposals,
        envelopes,
        approved,
        needsApproval,
        denied,
        capacity,
        ...(memoryHits !== null ? { memory_hits: memoryHits } : {}),
      };
    },

    // Propose a memory write-back (Step 3). Nothing is written here: this
    // builds ONE `memory.write` action through OperatorCore.proposeActions
    // so policy decides (the capability is R2, so it waits for an owner
    // approval bound to the exact action hash). The envelope args carry the
    // full new content AND the visible diff, so approving the action means
    // approving exactly that change - and execute() applies nothing else.
    async proposeMemoryWrite(input = {}) {
      if (!enabled) return { status: 'disabled' };
      if (!memory) {
        return { status: 'failed_closed', reason: 'memory is not configured for this planner' };
      }
      const relPath = input.path;
      if (!relPath || typeof relPath !== 'string') {
        return { status: 'failed_closed', reason: 'memory write needs a relative file path' };
      }
      let current;
      try {
        current = memory.readText(relPath) ?? '';
      } catch (err) {
        return { status: 'failed_closed', reason: err instanceof Error ? err.message : String(err) };
      }
      let newContent;
      if (typeof input.content === 'string') {
        newContent = input.content;
      } else if (typeof input.append === 'string') {
        const separator = current === '' || current.endsWith('\n') ? '' : '\n';
        newContent = current + separator + input.append;
      } else {
        return { status: 'failed_closed', reason: 'memory write needs content or append text' };
      }
      if (newContent === current) {
        return { status: 'failed_closed', reason: 'memory write would change nothing' };
      }
      const device = devices.find((d) => (d.capabilities || []).some((c) => c.name === MEMORY_WRITE_CAPABILITY));
      if (!device) {
        return { status: 'failed_closed', reason: `no enrolled device grants ${MEMORY_WRITE_CAPABILITY}` };
      }
      const diff = memory.diff(current, newContent, relPath);
      const resolvedCore = resolveCore();
      for (const d of devices) resolvedCore.devices.enroll(d);
      const job = resolvedCore.createJob(
        input.description || `Update memory file ${relPath}`,
        [device.device_id],
        {},
      );
      const envelopes = resolvedCore.proposeActions(job.job_id, [{
        device_id: device.device_id,
        capability: MEMORY_WRITE_CAPABILITY,
        args: { path: relPath, new_content: newContent, diff },
        expected_effect: { memory_file: relPath },
      }]);
      for (const env of envelopes) knownEnvelopes.set(env.action_id, env);
      const { approved, needsApproval, denied } = resolvedCore.authorize(job.job_id);
      return {
        status: 'proposed', job_id: job.job_id, diff, envelopes, approved, needsApproval, denied,
      };
    },

    // Execute a planned job through the core. The core re-checks policy and
    // approval coverage at execution time, so an R2+ action without an
    // approval bound to its exact hash is denied there - never run here on
    // the model's say-so.
    //
    // Memory writes are the one real effect this service applies itself:
    // for each memory.write action the core EXECUTED SUCCESSFULLY (which
    // already proves a live approval covers its exact hash), the store
    // applies the envelope's content - and only after re-deriving the diff
    // from the file as it stands now and matching it to the approved diff.
    //
    // Honest-record rule (Codex P2, PR #3341): the core's executor is a
    // simulation - its success receipt says the approved action was
    // dispatched, but the REAL effect is the file write below, which can
    // still fail (owner edited the file after approval, I/O error). The
    // core has no "executed but effect failed" state, so when a write does
    // not land this service appends a corrective `failed` receipt to the
    // same job's audit chain (append-only: history is corrected, never
    // rewritten) and flips the job off `completed` to `failed`. A memory
    // write that did not land never leaves behind a bare success receipt
    // plus a completed job claiming it did.
    async execute(jobId) {
      if (!enabled) return { status: 'disabled' };
      const resolvedCore = resolveCore();
      const receipts = resolvedCore.execute(jobId);
      const result = { status: 'executed', job_id: jobId, receipts };
      if (memory) {
        const writes = [];
        const failedWrites = [];
        for (const receipt of receipts) {
          if (receipt.outcome !== 'success') continue;
          const env = knownEnvelopes.get(receipt.action_id);
          if (!env || env.capability !== MEMORY_WRITE_CAPABILITY) continue;
          const args = env.args || {};
          let write;
          if (typeof args.path !== 'string' || typeof args.new_content !== 'string' || typeof args.diff !== 'string') {
            write = {
              action_id: env.action_id, path: args.path, applied: false,
              reason: 'envelope lacks the approved content/diff - not applied',
            };
          } else {
            try {
              write = {
                action_id: env.action_id, path: args.path,
                ...memory.applyApprovedWrite({ relPath: args.path, newContent: args.new_content, diff: args.diff }),
              };
            } catch (err) {
              write = {
                action_id: env.action_id, path: args.path, applied: false,
                reason: err instanceof Error ? err.message : String(err),
              };
            }
          }
          writes.push(write);
          if (!write.applied) failedWrites.push({ env, write });
        }
        if (writes.length > 0) result.memory_writes = writes;
        if (failedWrites.length > 0) {
          for (const { env, write } of failedWrites) {
            receipts.push(resolvedCore.audit.append({
              action_id: env.action_id, job_id: jobId, device_id: env.device_id,
              outcome: 'failed',
              reason_code: `memory_write_not_applied: ${write.reason}`,
              executor_version: 'planner-memory-effect/1',
              args: env.args || {},
              before_state_hash: 'n/a', after_state_hash: 'n/a',
            }));
          }
          try {
            const job = resolvedCore.getJob(jobId);
            if (job && job.status === 'completed') job.status = 'failed';
          } catch {
            // Job record unavailable; the corrective receipts above still
            // keep the audit trail honest.
          }
          result.status = 'effect_failed';
        }
      }
      return result;
    },
  };
}

function plannerFromEnv(env = process.env, overrides = {}) {
  const enabled = /^(1|true|yes)$/i.test(env.OPERATOR_PLANNER_ENABLED || '');
  const minAvailableMiB = Number(env.OPERATOR_PLANNER_MIN_AVAILABLE_MIB);
  const config = {
    enabled,
    capacityChecker: createCapacityChecker({
      minAvailableMiB: Number.isFinite(minAvailableMiB) && minAvailableMiB > 0
        ? minAvailableMiB
        : DEFAULT_MIN_AVAILABLE_MIB,
    }),
    env,
    ...overrides,
  };
  // Memory (Step 3) is opt-in via OPERATOR_MEMORY_DIR; an explicit
  // `memory` override (including null) always wins over the env.
  if (!('memory' in config) && env.OPERATOR_MEMORY_DIR) {
    config.memory = createFileMemoryStore(env.OPERATOR_MEMORY_DIR);
  }
  return createPlanner(config);
}

module.exports = {
  createPlanner,
  plannerFromEnv,
  createCapacityChecker,
  readAvailableMiB,
  DEFAULT_MIN_AVAILABLE_MIB,
  MEMORY_WRITE_CAPABILITY,
};
