import {
  ActionEnvelope, Approval, Device, Job, JobStatus, OwnerPolicy, Receipt,
} from "./types";
import { actionHash, nowIso, signEnvelope, uid } from "./crypto";
import { decide, approvalCovers } from "./policy";
import { AuditStore } from "./audit";
import { DeviceRegistry } from "./devices";
import { FakeExecutor } from "./fake-executor";

// Operator core: the single authority. Understand -> Observe -> Plan ->
// Authorize -> Execute -> Verify -> Record. The model proposes; policy decides;
// deterministic code acts.
export class OperatorCore {
  readonly audit = new AuditStore();
  readonly devices = new DeviceRegistry();
  readonly executor = new FakeExecutor(this.audit);
  private jobs = new Map<string, Job>();
  private envelopes = new Map<string, ActionEnvelope>();
  private approvals: Approval[] = [];

  constructor(private policy: OwnerPolicy) {}

  createJob(description: string, target_devices: string[], constraints: Record<string, unknown> = {}): Job {
    const job: Job = {
      job_id: uid("job"), intent: { description, target_devices, constraints },
      status: "created", created_at: nowIso(), steps: [],
    };
    this.jobs.set(job.job_id, job);
    return job;
  }

  getJob(job_id: string): Job {
    const j = this.jobs.get(job_id);
    if (!j) throw new Error(`unknown job ${job_id}`);
    return j;
  }

  // --- Plan: a stub "model adapter" proposes typed actions. A real model
  // adapter plugs in here; whatever it returns still crosses policy below.
  proposeActions(job_id: string, proposals: Array<{
    device_id: string; capability: string; args: Record<string, unknown>;
    preconditions?: string[]; expected_effect?: Record<string, unknown>;
  }>): ActionEnvelope[] {
    const job = this.getJob(job_id);
    const device = this.devices.get(proposals[0]?.device_id ?? "");
    const envelopes = proposals.map((p, i) => {
      const cap = device?.capabilities.find((c) => c.name === p.capability);
      const env: ActionEnvelope = {
        action_id: uid("act"), job_id, device_id: p.device_id,
        capability: p.capability, args: p.args,
        preconditions: p.preconditions ?? cap?.preconditions ?? [],
        risk: cap?.risk ?? "R4", // unknown capability => most restrictive
        approval_ref: null,
        expires_at: new Date(Date.now() + this.policy.token_ttl_seconds * 1000).toISOString(),
        idempotency_key: `${job_id}:step_${i}`,
        expected_effect: p.expected_effect ?? {},
      };
      this.envelopes.set(env.action_id, env);
      return env;
    });
    job.steps = envelopes.map((e, i) => ({ step: i, action_id: e.action_id, status: "pending" }));
    job.status = "planned";
    return envelopes;
  }

  // --- Authorize: policy decides per action. Returns which need approval.
  authorize(job_id: string): { approved: ActionEnvelope[]; needsApproval: ActionEnvelope[]; denied: string[] } {
    const job = this.getJob(job_id);
    const approved: ActionEnvelope[] = [];
    const needsApproval: ActionEnvelope[] = [];
    const denied: string[] = [];
    for (const env of this.envelopesFor(job_id)) {
      const device = this.devices.get(env.device_id);
      const exec = device ? this.devices.executable(env.device_id) : { ok: false, reason: "unknown device" };
      if (!exec.ok) { denied.push(`${env.action_id}: ${exec.reason}`); continue; }
      const cap = device!.capabilities.find((c) => c.name === env.capability);
      if (!cap) { denied.push(`${env.action_id}: capability not granted`); continue; }
      const d = decide(env, cap, this.policy, this.approvals);
      if (d.kind === "deny") denied.push(`${env.action_id}: ${d.reason}`);
      else if (d.kind === "require_approval") needsApproval.push(env);
      else approved.push(env);
    }
    job.status = needsApproval.length ? "awaiting_approval" : job.status;
    return { approved, needsApproval, denied };
  }

  // Owner approves the EXACT action hash. Substitution is blocked.
  approve(action_id: string, decided_by: string): Approval {
    const env = this.envelopes.get(action_id);
    if (!env) throw new Error(`unknown action ${action_id}`);
    const approval: Approval = {
      approval_id: uid("apr"),
      action_hash: actionHash(env as unknown as Record<string, unknown>),
      job_id: env.job_id, decided_at: nowIso(), decision: "approved",
      expires_at: new Date(Date.now() + this.policy.approval_expiry_seconds * 1000).toISOString(),
      decided_by,
    };
    this.approvals.push(approval);
    return approval;
  }

  // --- Execute: sign, dispatch, verify, record. Fail closed everywhere.
  execute(job_id: string): Receipt[] {
    const job = this.getJob(job_id);
    job.status = "executing";
    const receipts: Receipt[] = [];
    for (const step of job.steps) {
      const env = this.envelopes.get(step.action_id)!;
      const device = this.devices.get(env.device_id)!;

      // Re-check approval coverage at execution time (freshness matters).
      if (env.risk === "R2" || env.risk === "R3" || env.risk === "R4") {
        const ap = this.approvals.find((a) => a.action_hash === actionHash(env as unknown as Record<string, unknown>));
        const check = ap ? approvalCovers(ap, env) : { ok: false, reason: "no approval presented" };
        if (!check.ok) {
          step.status = "denied";
          receipts.push(this.audit.append({
            action_id: env.action_id, job_id, device_id: env.device_id,
            outcome: "denied", reason_code: `approval:${check.reason}`,
            executor_version: this.executor.version, args: env.args,
            before_state_hash: "n/a", after_state_hash: "n/a",
          }));
          continue;
        }
        env.approval_ref = ap!.approval_id;
      }

      const signed: ActionEnvelope = { ...env, signature: signEnvelope(env as unknown as Record<string, unknown>) };
      const receipt = this.executor.execute(device, signed);
      receipts.push(receipt);
      step.status = receipt.outcome === "success" ? "executed" : receipt.outcome === "duplicate_suppressed" ? "executed" : "failed";
      if (receipt.outcome === "denied" || receipt.outcome === "failed") {
        job.status = "failed";
        return receipts; // fail closed: stop the job on first denial/failure
      }
    }
    job.status = "verifying";
    // Verify: every step has a success receipt and the chain is intact.
    const chainOk = this.audit.verifyChain(job_id);
    job.status = chainOk ? "completed" : "failed";
    return receipts;
  }

  private envelopesFor(job_id: string): ActionEnvelope[] {
    return [...this.envelopes.values()].filter((e) => e.job_id === job_id);
  }
}
