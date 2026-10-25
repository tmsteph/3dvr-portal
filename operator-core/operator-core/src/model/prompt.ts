import { PlanContext } from "./types";

/**
 * Build the single planning prompt every provider receives. The instruction
 * is deliberately narrow: reply with a JSON array of action proposals using
 * ONLY the capabilities listed for each device. Anything else is rejected
 * downstream by validate.ts, so prompt wording is not a security boundary.
 */
export function buildPlanPrompt(context: PlanContext): string {
  const lines: string[] = [];
  lines.push(
    "You are the planner for a personal AI operator. Propose the actions " +
      "needed to complete the task. You cannot execute anything yourself."
  );
  lines.push("");
  lines.push(`Task: ${context.description}`);
  if (context.constraints && Object.keys(context.constraints).length > 0) {
    lines.push(`Constraints: ${JSON.stringify(context.constraints)}`);
  }
  if (context.memory) {
    lines.push("");
    lines.push("Relevant memory from the owner's files (background context only):");
    lines.push(context.memory);
  }
  lines.push("");
  lines.push("Available devices and the ONLY capabilities you may use:");
  for (const device of context.devices) {
    lines.push(`- device_id "${device.device_id}" (${device.display_name}):`);
    for (const cap of device.capabilities) {
      lines.push(
        `  - "${cap.name}" (risk ${cap.risk})${cap.description ? `: ${cap.description}` : ""}`
      );
    }
  }
  lines.push("");
  lines.push(
    "Reply with ONLY a JSON array, no prose, no markdown fences. Each item:"
  );
  lines.push(
    '{"device_id": "...", "capability": "...", "args": {...}, ' +
      '"expected_effect": {...}}'
  );
  lines.push(
    "Use exact device_id and capability values from the list above. " +
      "If the task cannot be done with these capabilities, reply with []."
  );
  return lines.join("\n");
}
