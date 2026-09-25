const MAX_PATH = 500;
const MAX_LABEL = 180;
const MAX_CONVERSATION = 160;

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const cleanPath = value => {
  const path = clean(value, MAX_PATH);
  return path.startsWith('/') && !path.startsWith('//') ? path : '';
};

export function operatorHandoffUrl({
  conversation = '',
  path = '',
  title = '',
  heading = ''
} = {}) {
  const params = new URLSearchParams();
  const conversationId = clean(conversation, MAX_CONVERSATION);
  const sourcePath = cleanPath(path);
  const pageTitle = clean(title, MAX_LABEL);
  const pageHeading = clean(heading, MAX_LABEL);

  if (conversationId) params.set('conversation', conversationId);
  if (sourcePath) params.set('from', sourcePath);
  if (pageTitle) params.set('title', pageTitle);
  if (pageHeading) params.set('heading', pageHeading);

  return `/operator/${params.size ? `?${params.toString()}` : ''}`;
}

export function readOperatorHandoff(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return {
    path: cleanPath(params.get('from')),
    title: clean(params.get('title'), MAX_LABEL),
    heading: clean(params.get('heading'), MAX_LABEL)
  };
}

export function handoffPageContext(handoff = {}, fallback = {}) {
  const path = cleanPath(handoff.path || fallback.path);
  const title = clean(handoff.title || fallback.title, MAX_LABEL);
  const heading = clean(handoff.heading || fallback.heading, MAX_LABEL);

  return {
    path,
    title,
    heading,
    area: handoff.path ? 'portal-handoff' : clean(fallback.area || 'operator', 80)
  };
}
