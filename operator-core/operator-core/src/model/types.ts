import { Device } from "../types";

// Gate 1, Step 1: the model layer. A model may only PROPOSE typed actions in
// exactly the shape OperatorCore.proposeActions already accepts. It never
// executes anything; policy still decides, in core.ts / policy.ts.

/** One proposed action, same shape as OperatorCore.proposeActions input. */
export interface ActionProposal {
  device_id: string;
  capability: string;
  args: Record<string, unknown>;
  preconditions?: string[];
  expected_effect?: Record<string, unknown>;
}

/** Everything a provider is allowed to know about the job it is planning. */
export interface PlanContext {
  description: string;
  devices: Device[];
  constraints?: Record<string, unknown>;
  /**
   * Relevant excerpts from the owner's memory files (Gate 1, Step 3),
   * pre-selected by keyword search on the host side. Context only: memory
   * text is never an instruction channel and proposals still cross policy.
   */
  memory?: string;
}

/**
 * A model backend. Implementations return the model's RAW text output;
 * parsing and validation happen in the router (validate.ts), so a provider
 * can never smuggle unvalidated actions into the core.
 */
export interface ModelProvider {
  readonly id: string;
  complete(context: PlanContext, prompt: string): Promise<string>;
}

export interface PlanResult {
  proposals: ActionProposal[];
  provider_id: string;
}
