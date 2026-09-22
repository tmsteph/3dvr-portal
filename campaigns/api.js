export const VERCEL_PORTAL_ORIGIN = 'https://3dvr-portal-phi.vercel.app';

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

export function portalApiCandidates(
  path,
  currentOrigin = globalThis.location?.origin || ''
) {
  const cleanPath = String(path || '').startsWith('/')
    ? String(path)
    : `/${String(path || '')}`;
  const primary = currentOrigin
    ? new URL(cleanPath, currentOrigin).toString()
    : cleanPath;
  const fallback = new URL(cleanPath, VERCEL_PORTAL_ORIGIN).toString();

  return originOf(primary) === originOf(fallback)
    ? [primary]
    : [primary, fallback];
}

export async function fetchPortalJson(path, options = {}, {
  fetchImpl = globalThis.fetch,
  currentOrigin = globalThis.location?.origin || ''
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Network access is unavailable.');
  }

  const candidates = portalApiCandidates(path, currentOrigin);
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const url = candidates[index];
    try {
      const response = await fetchImpl(url, options);
      const payload = await response.json().catch(() => ({}));
      const retryable = [500, 502, 503, 504].includes(response.status);

      if (retryable && index < candidates.length - 1) {
        lastError = new Error(
          payload.error || `Customer service returned ${response.status}.`
        );
        continue;
      }

      return {
        response,
        payload,
        url,
        usedFallback: index > 0
      };
    } catch (error) {
      lastError = error;
      if (index >= candidates.length - 1) break;
    }
  }

  const detail = cleanNetworkMessage(lastError?.message);
  throw new Error(detail
    ? `Customer search could not be reached. ${detail}`
    : 'Customer search could not be reached. We also tried the backup route.');
}

function cleanNetworkMessage(message = '') {
  const value = String(message || '').trim();
  if (!value || /failed to fetch|networkerror|load failed/i.test(value)) {
    return '';
  }
  return value.slice(0, 220);
}
