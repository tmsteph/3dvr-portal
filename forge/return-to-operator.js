import { safeOperatorReturn } from '../operator/forge-roundtrip.js';

const returnTo = safeOperatorReturn(window.location.search);
document.querySelectorAll('[data-return-operator]').forEach(link => {
  link.setAttribute('href', returnTo);
});

document.querySelectorAll('[data-forge-home]').forEach(link => {
  const url = new URL('/forge/', window.location.origin);
  if (returnTo !== '/operator/') url.searchParams.set('returnTo', returnTo);
  link.setAttribute('href', `${url.pathname}${url.search}`);
});
