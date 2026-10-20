import { ActionEnvelope, Approval, OwnerPolicy, RiskTier, CapabilityDef } from "./types";
import { actionHash, nowIso } from "./crypto";

// Pure functions only: no I/O, no clock reads except via parameters.
// Fixture-driven: every rule below is covered by policy/fixtures tests.

export type PolicyDecision =
  | { kind: "allow" }
  | { kind: "require_approval"; reason: string }
  | { kind: "deny"; reason: string };

function patternMatches(pattern: string, capability: string): boolean {
  if (pattern.endsWith(".*")) return capability.startsWith(pattern.slice(0, -2) + ".") || capability === pattern.slice(0, -2);
  return pattern === capability;
}

/** Decide what an action needs before the core may sign it. */
export function decide(
  envelope: Omit<ActionEnvelope, "signature" | "approval_ref">,
  capability: CapabilityDef,
  policy: OwnerPolicy,
  approvals: Approval[],
  now: string = nowIso()
): PolicyDecision {
  // 1. Owner allowlist overrides: some capabilities always need fresh approval.
  if (policy.fresh_approval_always.some((p) => patternMatches(p, envelope.capability))) {
    return { kind: "require_approval", reason: `owner policy: ${envelope.capability} always requires fresh approval` };
  }

  // 2. Risk tier default handling.
  switch (capability.risk) {
    case "R0":
    case "R1":
      break; // allowed, receipted
    case "R2":
    case "R3":
    case "R4": {
      const hash = actionHash(envelope as unknown as Record<string, unknown>);
      const ok = approvals.some(
        (a) => a.action_hash === hash && a.decision === "approved" && a.expires_at > now
      );
      if (!ok) {
        return { kind: "require_approval", reason: `risk ${capability.risk} requires a live approval bound to the action hash` };
      }
      break;
    }
  }
  return { kind: "allow" };
}

/** Validate that a presented approval actually authorizes this exact action. */
export function approvalCovers(
  approval: Approval,
  envelope: Omit<ActionEnvelope, "signature">,
  now: string = nowIso()
): { ok: boolean; reason: string } {
  if (approval.decision !== "approved") return { ok: false, reason: "approval was denied" };
  if (approval.expires_at <= now) return { ok: false, reason: "approval expired" };
  const hash = actionHash(envelope as unknown as Record<string, unknown>);
  if (approval.action_hash !== hash) return { ok: false, reason: "approval hash does not match action (substitution blocked)" };
  return { ok: true, reason: "ok" };
}

export function riskLabel(tier: RiskTier): string {
  return { R0: "Observe", R1: "Reversible", R2: "External", R3: "Sensitive", R4: "Destructive" }[tier];
}
