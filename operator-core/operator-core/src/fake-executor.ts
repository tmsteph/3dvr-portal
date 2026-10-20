import { ActionEnvelope, CapabilityDef, Device, Receipt } from "./types";
import { nowIso, sha256Hex, verifyEnvelopeSignature } from "./crypto";
import { AuditStore } from "./audit";

// Fake executor: implements the EXACT checks a real executor must perform,
// but simulates effects instead of touching a device. Used for Gate 0/1 and
// for replay tests. A real executor replaces `simulateEffect` only.
export class FakeExecutor {
  readonly version = "0.1.0-fake";
  private seenKeys = new Map<string, string>(); // idempotency_key -> receipt_id
  private state = new Map<string, string>(); // device_id -> state hash

  constructor(private audit: AuditStore) {}

  execute(device: Device, envelope: ActionEnvelope): Receipt {
    const started = nowIso();
    const deny = (reason_code: string): Receipt =>
      this.audit.append({
        action_id: envelope.action_id, job_id: envelope.job_id, device_id: device.device_id,
        outcome: "denied", reason_code, executor_version: this.version,
        args: envelope.args, before_state_hash: this.stateOf(device.device_id), after_state_hash: this.stateOf(device.device_id),
      });

    // 1. Signature: reject unsigned or tampered envelopes.
    if (!verifyEnvelopeSignature(envelope as unknown as Record<string, unknown>)) {
      return deny("unsigned_or_tampered_envelope");
    }
    // 2. Expiry: short-lived tokens only.
    if (envelope.expires_at <= started) {
      return deny("action_token_expired");
    }
    // 3. Capability must be locally granted to this device.
    const cap: CapabilityDef | undefined = device.capabilities.find((c) => c.name === envelope.capability);
    if (!cap) {
      return deny("capability_not_granted");
    }
    // 4. Idempotency: duplicate delivery -> one effect, linked receipt.
    const prior = this.seenKeys.get(envelope.idempotency_key);
    if (prior) {
      const r = this.audit.append({
        action_id: envelope.action_id, job_id: envelope.job_id, device_id: device.device_id,
        outcome: "duplicate_suppressed", reason_code: `duplicate_of:${prior}`,
        executor_version: this.version, args: envelope.args,
        before_state_hash: this.stateOf(device.device_id), after_state_hash: this.stateOf(device.device_id),
      });
      return r;
    }
    // 5. Preconditions re-checked immediately before acting.
    const missing = envelope.preconditions.filter((p) => !this.checkPrecondition(device.device_id, p));
    if (missing.length) {
      return deny(`precondition_failed:${missing.join(",")}`);
    }

    // 6. Deterministic simulated effect.
    const before = this.stateOf(device.device_id);
    this.simulateEffect(device.device_id, envelope);
    const after = this.stateOf(device.device_id);
    this.seenKeys.set(envelope.idempotency_key, envelope.action_id);

    return this.audit.append({
      action_id: envelope.action_id, job_id: envelope.job_id, device_id: device.device_id,
      outcome: "success", reason_code: "ok", executor_version: this.version,
      args: envelope.args, before_state_hash: before, after_state_hash: after,
    });
  }

  private stateOf(device_id: string): string {
    return sha256Hex(this.state.get(device_id) ?? "initial").slice(0, 16);
  }

  private simulateEffect(device_id: string, envelope: ActionEnvelope): void {
    // Deterministic stand-in for real device effects.
    this.state.set(device_id, sha256Hex(`${device_id}:${envelope.capability}:${JSON.stringify(envelope.args)}`));
  }

  private checkPrecondition(_device_id: string, precondition: string): boolean {
    // Fake world: screen_unlocked and package_foreground hold; wifi_lost does not.
    if (precondition === "wifi_lost") return false;
    return true;
  }
}
