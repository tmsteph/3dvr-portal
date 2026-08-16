export const DECISIONS = Object.freeze({
  ALLOW: 'allow',
  ASK: 'ask',
  DENY: 'deny'
});

export function createPolicy(rules = {}) {
  return {
    decide(capability) {
      return rules[capability] ?? DECISIONS.ASK;
    }
  };
}
