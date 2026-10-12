// Minimal, provider-neutral Operator task packet contract.
// No credentials, personal records, or arbitrary shell commands in packets.
export const PACKET_VERSION = 1;
const allowedClasses = new Set(['public', 'internal', 'restricted']);
const allowedWorkers = new Set(['ovh', 'hetzner', 'cloud']);
const isString = value => typeof value === 'string' && value.trim().length > 0;
// Scope allowed paths to normalized, relative repository locations.
// A path allowlist must not grant access to absolute filesystem paths.
const safePath = value => isString(value) && value === value.trim() &&
  !/[\\\x00-\x1f\x7f]/.test(value) &&
  !value.startsWith('/') && !value.startsWith('~') &&
  !/^[a-zA-Z]:/.test(value) &&
  value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
export function validateTaskPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return { ok: false, errors: ['packet must be an object'] };
  if (packet.version !== PACKET_VERSION) errors.push('unsupported packet version');
  for (const key of ['id', 'goal', 'expectedOutput']) if (!isString(packet[key])) errors.push(key + ' required');
  if (!allowedClasses.has(packet.privacy)) errors.push('invalid privacy');
  if (!allowedWorkers.has(packet.worker)) errors.push('invalid worker');
  if (!Array.isArray(packet.allowedPaths) || !packet.allowedPaths.every(safePath)) errors.push('invalid allowedPaths');
  if (!Array.isArray(packet.steps) || !packet.steps.length || !packet.steps.every(isString)) errors.push('steps required');
  if (!Array.isArray(packet.verification) || !packet.verification.length || !packet.verification.every(isString)) errors.push('verification required');
  if (!Number.isSafeInteger(packet.timeoutSeconds) || packet.timeoutSeconds < 1 || packet.timeoutSeconds > 3600) errors.push('invalid timeoutSeconds');
  if (!Number.isSafeInteger(packet.maxRetries) || packet.maxRetries < 0 || packet.maxRetries > 2) errors.push('invalid maxRetries');
  if (packet.privacy === 'restricted' && packet.worker === 'cloud') errors.push('restricted packets cannot use cloud workers');
  if (packet.requiresApproval !== true && packet.productionChange === true) errors.push('production changes require approval');
  return { ok: errors.length === 0, errors };
}
