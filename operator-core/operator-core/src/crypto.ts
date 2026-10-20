import { createHash, createHmac } from "crypto";

// Canonical JSON: sorted keys, no whitespace. Both sides must hash the same bytes.
export function canonical(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical((obj as Record<string, unknown>)[k])).join(",") + "}";
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// PROTOTYPE NOTE: the blueprint specifies Ed25519 device identity with the
// core signing action envelopes. Here we use HMAC-SHA256 with a core secret
// to demonstrate the envelope-signing contract; swap for Ed25519 before pilot.
const CORE_SECRET = process.env.OPERATOR_CORE_SECRET ?? "dev-only-core-secret";

export function signEnvelope(envelope: Record<string, unknown>): string {
  const { signature: _drop, ...body } = envelope;
  return createHmac("sha256", CORE_SECRET).update(canonical(body), "utf8").digest("hex");
}

export function verifyEnvelopeSignature(envelope: Record<string, unknown>): boolean {
  const sig = (envelope as { signature?: unknown }).signature;
  if (typeof sig !== "string") return false;
  const { signature: _drop, ...body } = envelope;
  const expected = createHmac("sha256", CORE_SECRET).update(canonical(body), "utf8").digest("hex");
  return sig === expected;
}

export function actionHash(envelope: Record<string, unknown>): string {
  const { signature: _drop, ...body } = envelope;
  return sha256Hex(canonical(body));
}

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(4, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ["password", "secret", "token", "api_key", "credential", "pin", "code"];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = sensitive.some((s) => k.toLowerCase().includes(s)) ? "[REDACTED]" : v;
  }
  return out;
}
