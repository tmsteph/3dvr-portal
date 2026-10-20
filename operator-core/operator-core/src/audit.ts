import { Receipt } from "./types";
import { canonical, redactArgs, sha256Hex, nowIso, uid } from "./crypto";

// Append-only, hash-chained receipt store. Tamper-evident per job:
// chain_hash = sha256(prev_chain_hash + canonical(receipt body)).
export class AuditStore {
  private receipts: Receipt[] = [];

  append(input: {
    action_id: string; job_id: string; device_id: string;
    outcome: Receipt["outcome"]; reason_code: string;
    executor_version: string; args: Record<string, unknown>;
    before_state_hash: string; after_state_hash: string;
  }): Receipt {
    const prev = this.receipts.length ? this.receipts[this.receipts.length - 1].chain_hash : null;
    const body = {
      receipt_id: uid("rcpt"),
      action_id: input.action_id, job_id: input.job_id, device_id: input.device_id,
      started_at: nowIso(), finished_at: nowIso(),
      outcome: input.outcome, reason_code: input.reason_code,
      executor_version: input.executor_version,
      args_redacted: redactArgs(input.args),
      before_state_hash: input.before_state_hash, after_state_hash: input.after_state_hash,
      prev_chain_hash: prev,
    };
    const chain_hash = sha256Hex((prev ?? "GENESIS") + canonical(body));
    const receipt: Receipt = { ...body, chain_hash };
    this.receipts.push(receipt);
    return receipt;
  }

  forJob(job_id: string): Receipt[] {
    return this.receipts.filter((r) => r.job_id === job_id);
  }

  /** Verify the hash chain for a job. Returns false on any tamper. */
  verifyChain(job_id: string): boolean {
    const rs = this.forJob(job_id);
    let prev: string | null = null;
    for (const r of rs) {
      if (r.prev_chain_hash !== prev) return false;
      const { chain_hash, ...body } = r;
      if (sha256Hex((prev ?? "GENESIS") + canonical(body)) !== chain_hash) return false;
      prev = chain_hash;
    }
    return true;
  }
}
