// The After dark gallery stays shut until the visitor is signed in to the
// portal on this device, using the same shared-identity check as the other
// portal tools. It keeps casual eyes out. The image files themselves live
// in the open repo, so this is a curtain, not a vault.
(function () {
  var lock = document.getElementById('afterDarkLock');
  var grid = document.getElementById('afterDarkGrid');
  if (!lock || !grid) return;
  var signedIn = false;
  try {
    var shared = window.AuthIdentity && typeof window.AuthIdentity.readSharedIdentity === 'function'
      ? window.AuthIdentity.readSharedIdentity()
      : null;
    signedIn = Boolean(shared && shared.signedIn) || window.localStorage.getItem('signedIn') === 'true';
  } catch (error) {
    signedIn = false;
  }
  if (signedIn) {
    lock.hidden = true;
    grid.hidden = false;
  }
})();
