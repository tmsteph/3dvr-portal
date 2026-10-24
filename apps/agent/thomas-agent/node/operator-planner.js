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

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
 * @param {object} [options.env] - env used when building the default router.
 */
function createPlanner(options = {}) {
  const enabled = options.enabled === true;
  const capacityChecker = options.capacityChecker || createCapacityChecker();
  const devices = options.devices || [];
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

      let planResult;
      try {
        planResult = await resolveRouter().propose({ description, devices, constraints });
      } catch (err) {
        // Router already failed closed (no valid plan from any provider).
        return { status: 'failed_closed', reason: err instanceof Error ? err.message : String(err) };
      }

      const resolvedCore = resolveCore();
      for (const device of devices) resolvedCore.devices.enroll(device);
      const job = resolvedCore.createJob(description, devices.map((d) => d.device_id), constraints);
      const envelopes = resolvedCore.proposeActions(job.job_id, planResult.proposals);
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
      };
    },

    // Execute a planned job through the core. The core re-checks policy and
    // approval coverage at execution time, so an R2+ action without an
    // approval bound to its exact hash is denied there - never run here on
    // the model's say-so.
    async execute(jobId) {
      if (!enabled) return { status: 'disabled' };
      const receipts = resolveCore().execute(jobId);
      return { status: 'executed', job_id: jobId, receipts };
    },
  };
}

function plannerFromEnv(env = process.env, overrides = {}) {
  const enabled = /^(1|true|yes)$/i.test(env.OPERATOR_PLANNER_ENABLED || '');
  const minAvailableMiB = Number(env.OPERATOR_PLANNER_MIN_AVAILABLE_MIB);
  return createPlanner({
    enabled,
    capacityChecker: createCapacityChecker({
      minAvailableMiB: Number.isFinite(minAvailableMiB) && minAvailableMiB > 0
        ? minAvailableMiB
        : DEFAULT_MIN_AVAILABLE_MIB,
    }),
    env,
    ...overrides,
  });
}

module.exports = {
  createPlanner,
  plannerFromEnv,
  createCapacityChecker,
  readAvailableMiB,
  DEFAULT_MIN_AVAILABLE_MIB,
};
