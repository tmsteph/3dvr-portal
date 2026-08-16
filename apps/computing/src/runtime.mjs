import { DECISIONS } from './policy.mjs';

export function createRuntime({ policy, adapters = {}, clock = () => new Date() }) {
  if (!policy?.decide) {
    throw new TypeError('policy.decide is required');
  }

  return {
    listCapabilities() {
      return Object.keys(adapters).sort();
    },

    async request(capability, input = {}) {
      const requestedAt = clock().toISOString();
      const decision = policy.decide(capability, input);
      const baseReceipt = {
        capability,
        decision,
        input,
        requestedAt
      };

      if (decision === DECISIONS.DENY) {
        return { ...baseReceipt, status: 'blocked' };
      }

      if (decision !== DECISIONS.ALLOW) {
        return { ...baseReceipt, status: 'needs_approval' };
      }

      const execute = adapters[capability];
      if (!execute) {
        return {
          ...baseReceipt,
          status: 'unavailable',
          error: 'No adapter registered for capability.'
        };
      }

      try {
        const result = await execute(input);
        return {
          ...baseReceipt,
          status: 'executed',
          completedAt: clock().toISOString(),
          result
        };
      } catch (error) {
        return {
          ...baseReceipt,
          status: 'failed',
          completedAt: clock().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}
