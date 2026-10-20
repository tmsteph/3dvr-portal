import { PlanContext, PlanResult, ModelProvider } from "./types";
import { buildPlanPrompt } from "./prompt";
import { parseModelOutput, validateProposals } from "./validate";

export class ModelRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRouterError";
  }
}

/**
 * Tries providers in order (API-first by default, per config) and returns the
 * first plan that parses AND validates. A provider that errors, returns
 * garbage, or hallucinates an ungranted capability does not fail the job if a
 * fallback produces a valid plan; if none do, the router throws - fail closed,
 * no partial plan is ever returned.
 */
export class ModelRouter {
  constructor(private providers: ModelProvider[]) {
    if (providers.length === 0) {
      throw new ModelRouterError("model router needs at least one provider");
    }
  }

  providerIds(): string[] {
    return this.providers.map((p) => p.id);
  }

  async propose(context: PlanContext): Promise<PlanResult> {
    const prompt = buildPlanPrompt(context);
    const failures: string[] = [];
    for (const provider of this.providers) {
      try {
        const raw = await provider.complete(context, prompt);
        const proposals = validateProposals(parseModelOutput(raw), context.devices);
        return { proposals, provider_id: provider.id };
      } catch (err) {
        failures.push(`${provider.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new ModelRouterError(
      `no provider produced a valid plan (${failures.join("; ")})`
    );
  }
}
