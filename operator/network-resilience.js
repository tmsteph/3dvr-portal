const INSTALL_KEY = '__3dvrOperatorFetchRetryInstalled';
const RETRY_DELAY_MS = 650;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function operatorRequestUrl(input) {
  const raw = typeof input === 'string' ? input : input?.url || '';
  if (!raw) return null;
  try {
    return new URL(raw, globalThis.location?.href || 'https://portal.3dvr.tech/');
  } catch {
    return null;
  }
}

function isOperatorApiRequest(input) {
  const url = operatorRequestUrl(input);
  if (!url) return false;
  const currentOrigin = globalThis.location?.origin || url.origin;
  return url.origin === currentOrigin
    && url.pathname === '/api/openai-site'
    && url.searchParams.get('provider') === 'operator';
}

function requestMethod(input, init = {}) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

export function installOperatorFetchRetry(target = globalThis) {
  if (!target?.fetch || target[INSTALL_KEY]) return;

  const originalFetch = target.fetch.bind(target);
  target[INSTALL_KEY] = true;

  target.fetch = async (input, init) => {
    try {
      return await originalFetch(input, init);
    } catch (error) {
      const retryable = isOperatorApiRequest(input)
        && requestMethod(input, init) === 'POST';
      if (!retryable) throw error;

      await sleep(RETRY_DELAY_MS);
      try {
        return await originalFetch(input, init);
      } catch (retryError) {
        const message = target.navigator?.onLine === false
          ? 'You appear to be offline. Reconnect and try Operator again.'
          : 'Connection to Operator was interrupted. Please try again.';
        const wrapped = new TypeError(message);
        wrapped.cause = retryError;
        throw wrapped;
      }
    }
  };
}

installOperatorFetchRetry();
