// Types mirror protocol/schemas/*.json. In the real repo these are generated
// from the JSON Schemas; here they are hand-kept in sync for the prototype.

export type RiskTier = "R0" | "R1" | "R2" | "R3" | "R4";

export interface ActionEnvelope {
  action_id: string;
  job_id: string;
  device_id: string;
  capability: string;
  args: Record<string, unknown>;
  preconditions: string[];
  risk: RiskTier;
  approval_ref: string | null;
  expires_at: string; // ISO
  idempotency_key: string;
  expected_effect: Record<string, unknown>;
  signature?: string; // set by Core.signAction
}

export interface CapabilityDef {
  name: string;
  version: string;
  risk: RiskTier;
  args_schema: Record<string, unknown>; // subset of JSON Schema we validate by hand
  preconditions: string[];
  description?: string;
}

export interface Approval {
  approval_id: string;
  action_hash: string; // sha256 of canonical envelope (minus signature)
  job_id: string;
  decided_at: string;
  decision: "approved" | "denied";
  expires_at: string;
  decided_by?: string;
  scope_note?: string;
}

export interface Receipt {
  receipt_id: string;
  action_id: string;
  job_id: string;
  device_id: string;
  started_at: string;
  finished_at: string;
  outcome: "success" | "denied" | "failed" | "duplicate_suppressed";
  reason_code: string;
  executor_version: string;
  args_redacted: Record<string, unknown>;
  before_state_hash: string;
  after_state_hash: string;
  prev_chain_hash: string | null;
  chain_hash: string;
}

export type JobStatus =
  | "created" | "planned" | "awaiting_approval" | "executing"
  | "verifying" | "completed" | "paused" | "cancelled" | "failed";

export interface JobStep { step: number; action_id: string; status: "pending" | "approved" | "denied" | "executed" | "verified" | "failed" | "skipped"; }

export interface Job {
  job_id: string;
  intent: { description: string; target_devices: string[]; constraints: Record<string, unknown> };
  status: JobStatus;
  created_at: string;
  steps: JobStep[];
}

export type DeviceKind = "android_companion" | "adb_bridge" | "host_agent";
export type TrustStatus = "healthy" | "degraded" | "revoked" | "unseen";

export interface Device {
  device_id: string;
  kind: DeviceKind;
  display_name: string;
  public_key: string;
  enrolled_at: string;
  capabilities: CapabilityDef[];
  trust: { status: TrustStatus; last_seen_at?: string; revoked_at?: string | null };
}

export interface OwnerPolicy {
  fresh_approval_always: string[]; // capability patterns, * = wildcard
  approval_expiry_seconds: number;
  token_ttl_seconds: number;
}
