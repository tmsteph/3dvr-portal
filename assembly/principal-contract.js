export const PRINCIPAL_TYPES = Object.freeze(['user', 'agent', 'device', 'service']);
export const ASSURANCE_LEVELS = Object.freeze(['low', 'standard', 'strong']);

const requiredText = (value, label) => {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
};

export function createAuthenticatedPrincipal(input, options = {}) {
  const type = requiredText(input?.type, 'Principal type');
  if (!PRINCIPAL_TYPES.includes(type)) throw new Error(`Unsupported principal type: ${type}`);
  const assurance = String(input?.assurance || 'standard');
  if (!ASSURANCE_LEVELS.includes(assurance)) throw new Error(`Unsupported assurance level: ${assurance}`);
  const authenticatedAt = Number.isFinite(Number(options.now ?? input?.authenticatedAt))
    ? Number(options.now ?? input.authenticatedAt)
    : Date.now();

  return Object.freeze({
    id: requiredText(input?.id, 'Principal ID'),
    type,
    issuer: requiredText(input?.issuer, 'Identity issuer'),
    subject: requiredText(input?.subject, 'Identity subject'),
    displayName: String(input?.displayName || ''),
    assurance,
    authenticatedAt,
  });
}

export function validateAuthenticatedPrincipal(value) {
  return createAuthenticatedPrincipal(value, { now: value?.authenticatedAt });
}

export function principalExternalKey(principal) {
  const valid = validateAuthenticatedPrincipal(principal);
  return `${valid.issuer}::${valid.subject}`;
}
