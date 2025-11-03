// src/gun/env.js
// Utility helpers that describe the runtime context so Gun nodes remain predictable across browsers and previews.
export function getEnvInfo() {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  const search = typeof location !== 'undefined' ? location.search : '';
  const isVercelPreview = /\.vercel\.app$/i.test(host) && !/^prod[\.-]/i.test(host);
  // Try to extract PR # from hostname like app-pr-123-...vercel.app
  const prFromHost = (host.match(/(?:^|-)pr-?(\d+)(?:-|\.|$)/i) || [])[1];
  // Allow build systems to inject this:
  /* global __PR_NUMBER__ __APP_NAME__ __GUN_RELAY__ */
  const PR = (typeof __PR_NUMBER__ !== 'undefined' && __PR_NUMBER__)
    || prFromHost
    || new URLSearchParams(search).get('pr')
    || 'dev';

  const APP = (typeof __APP_NAME__ !== 'undefined' && __APP_NAME__) || '3dvr-tech';
  const RELAY = (typeof __GUN_RELAY__ !== 'undefined' && __GUN_RELAY__) || '{{WSS_RELAY_URL}}';

  // In previews, we prefer no browser cache; in prod, enable offline cache.
  const cacheEnabled = !isVercelPreview;

  const ROOT = `${APP}:${isVercelPreview ? 'pr' : 'prod'}:${PR}`;
  return { host, isVercelPreview, PR, APP, RELAY, ROOT, cacheEnabled };
}
