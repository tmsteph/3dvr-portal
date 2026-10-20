import { Device } from "../types";
import { ActionProposal } from "./types";

// Fail-closed validation of model output. The model is untrusted input:
// every rule below rejects the WHOLE batch on any violation, so a partially
// valid plan can never slip through.

export class ModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelValidationError";
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Extract and JSON-parse the model's raw text. Throws ModelValidationError. */
export function parseModelOutput(raw: string): unknown {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ModelValidationError("model returned empty output");
  }
  let text = raw.trim();
  // Tolerate a single markdown code fence around the JSON.
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new ModelValidationError("model output is not valid JSON");
  }
}

/**
 * Validate a parsed value as a batch of action proposals against the devices
 * the planner was given. Returns clean proposals (unknown fields stripped).
 */
export function validateProposals(parsed: unknown, devices: Device[]): ActionProposal[] {
  if (!Array.isArray(parsed)) {
    throw new ModelValidationError("model output must be a JSON array of proposals");
  }
  if (parsed.length === 0) {
    throw new ModelValidationError("model proposed no actions");
  }
  const byId = new Map(devices.map((d) => [d.device_id, d]));
  return parsed.map((item, i) => {
    const where = `proposal ${i}`;
    if (!isPlainObject(item)) {
      throw new ModelValidationError(`${where}: not an object`);
    }
    const { device_id, capability, args, preconditions, expected_effect } = item;
    if (typeof device_id !== "string" || !byId.has(device_id)) {
      throw new ModelValidationError(`${where}: unknown device_id ${JSON.stringify(device_id)}`);
    }
    const device = byId.get(device_id)!;
    if (
      typeof capability !== "string" ||
      !device.capabilities.some((c) => c.name === capability)
    ) {
      throw new ModelValidationError(
        `${where}: capability ${JSON.stringify(capability)} is not granted on device ${device_id}`
      );
    }
    if (!isPlainObject(args)) {
      throw new ModelValidationError(`${where}: args must be an object`);
    }
    if (
      preconditions !== undefined &&
      (!Array.isArray(preconditions) || preconditions.some((p) => typeof p !== "string"))
    ) {
      throw new ModelValidationError(`${where}: preconditions must be an array of strings`);
    }
    if (expected_effect !== undefined && !isPlainObject(expected_effect)) {
      throw new ModelValidationError(`${where}: expected_effect must be an object`);
    }
    const clean: ActionProposal = { device_id, capability, args };
    if (preconditions !== undefined) clean.preconditions = preconditions as string[];
    if (expected_effect !== undefined) {
      clean.expected_effect = expected_effect as Record<string, unknown>;
    }
    return clean;
  });
}
