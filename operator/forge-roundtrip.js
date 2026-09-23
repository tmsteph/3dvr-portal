export function operatorReturnPath(conversationId = '') {
  const id = String(conversationId || '').trim();
  const params = new URLSearchParams();
  if (id) params.set('conversation', id);
  return `/operator/${params.size ? `?${params.toString()}` : ''}`;
}

export function forgeUrlWithReturn(url = '', conversationId = '') {
  const raw = String(url || '').trim();
  if (!raw.startsWith('/forge/')) return raw;

  const target = new URL(raw, 'https://portal.3dvr.tech');
  target.searchParams.set('returnTo', operatorReturnPath(conversationId));
  return `${target.pathname}${target.search}${target.hash}`;
}

export function requestedOperatorConversation(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return String(params.get('conversation') || '').trim();
}

export function safeOperatorReturn(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const value = String(params.get('returnTo') || '').trim();
  if (!value) return '/operator/';

  try {
    const url = new URL(value, 'https://portal.3dvr.tech');
    if (url.origin !== 'https://portal.3dvr.tech' || url.pathname !== '/operator/') return '/operator/';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/operator/';
  }
}
