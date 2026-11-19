'use strict';

// Resolve the secrets backend a connector should use for credential
// storage, in preference order:
//   1. An explicitly injected backend (tests, admin tooling).
//   2. The direct OpenBao backend, when this process can read the
//      OpenBao AppRole files (root and broker-service contexts).
//   3. The broker-mediated backend, when the local secrets broker is
//      reachable and this process holds an agent token. This is the
//      path for unprivileged runtime users (for example the OVH
//      `debian` operator runtime) that must not read the AppRole files.

const { OpenBaoBackend } = require('./openbao');
const { BrokerBackend } = require('./broker');

function usable(backend) {
  try {
    return backend && backend.ready() ? backend : null;
  } catch {
    return null;
  }
}

function resolveSecretsBackend(explicit, options = {}) {
  if (explicit) return usable(explicit);
  return usable(new OpenBaoBackend(options.openBaoConfig || {}))
    || usable(new BrokerBackend(options.brokerConfig || {}, { env: options.env }));
}

module.exports = {
  resolveSecretsBackend,
};
