// Adapt Operator to the shared Portal account menu and score manager.
window.AuthIdentity?.syncStorageFromSharedIdentity?.(window.localStorage);
const operatorAccountRuntime = window.ScoreSystem.ensureGun(
  () => window.Gun({ peers: window.__GUN_PEERS__ || [], localStorage: false }),
  { label: 'operator-account' }
);
window.gun = operatorAccountRuntime.gun;
window.user = operatorAccountRuntime.user;

// Refresh recalled identity when another tab signs in or out.
window.addEventListener('storage', event => {
  if (['signedIn', 'alias', 'username', 'guest'].includes(event.key) || event.key === null) {
    // Reinitialize account-scoped history and score together.
    window.location.reload();
  }
});
