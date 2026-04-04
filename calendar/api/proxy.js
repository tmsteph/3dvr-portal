import {
  buildProxyHeaders,
  buildProxyTargetUrl,
  readProxyBody,
  resolvePortalOrigin,
} from '../api-proxy.js';

const SKIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'set-cookie',
  'transfer-encoding',
]);

function copyResponseHeaders(response, res) {
  if (typeof response.headers.getSetCookie === 'function') {
    const setCookie = response.headers.getSetCookie();
    if (setCookie.length) {
      res.setHeader('Set-Cookie', setCookie);
    }
  }

  response.headers.forEach((value, key) => {
    if (SKIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      return;
    }
    res.setHeader(key, value);
  });
}

export default async function handler(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req, process.env);
    const targetUrl = buildProxyTargetUrl(req, portalOrigin);
    const body = await readProxyBody(req);
    const response = await fetch(targetUrl, {
      method: String(req?.method || 'GET').toUpperCase(),
      headers: buildProxyHeaders(req),
      body,
      redirect: 'manual',
    });

    copyResponseHeaders(response, res);
    const payload = Buffer.from(await response.arrayBuffer());
    res.statusCode = response.status;
    res.end(payload);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'Calendar API proxy failed.',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

export { resolvePortalOrigin };
