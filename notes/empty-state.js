export const MOBILE_BREAKPOINT = 900;

export function shouldShowInlineCreate({ viewportWidth, hasActiveFolder, hasVisibleNotes } = {}) {
  const width = typeof viewportWidth === 'number' ? viewportWidth : 0;
  const active = typeof hasActiveFolder === 'boolean' ? hasActiveFolder : true;
  const visible = typeof hasVisibleNotes === 'boolean' ? hasVisibleNotes : false;
  return width <= MOBILE_BREAKPOINT && active && !visible;
}

if (typeof globalThis !== 'undefined') {
  const namespace = globalThis.NotesEmptyState || {};
  namespace.shouldShowInlineCreate = namespace.shouldShowInlineCreate || shouldShowInlineCreate;
  namespace.MOBILE_BREAKPOINT = namespace.MOBILE_BREAKPOINT || MOBILE_BREAKPOINT;
  globalThis.NotesEmptyState = namespace;
}
