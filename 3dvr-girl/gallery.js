// The After dark gallery stays shut until the visitor is signed in to the
// portal on this device, using the same shared-identity check as the other
// portal tools. It keeps casual eyes out. The image files themselves live
// in the open repo, so this is a curtain, not a vault.
//
// Tapping a photo opens the full-screen viewer: swipe, arrows, or keyboard
// to move through the set.
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
  if (!signedIn) return;
  lock.hidden = true;
  grid.hidden = false;

  var dialog = document.getElementById('galleryDialog');
  var image = document.getElementById('galleryImage');
  var caption = document.getElementById('galleryCaption');
  var counter = document.getElementById('galleryCounter');
  if (!dialog || !image) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.private-card'));
  var items = cards.map(function (card) {
    var link = card.querySelector('a');
    var img = card.querySelector('img');
    var who = card.querySelector('figcaption span');
    var title = card.querySelector('figcaption strong');
    return {
      src: link ? link.getAttribute('href') : (img ? img.getAttribute('src') : ''),
      alt: img ? img.getAttribute('alt') : '',
      label: ((who ? who.textContent : '') + ' · ' + (title ? title.textContent : '')).replace(/^ · /, '')
    };
  });
  if (!items.length) return;

  var index = 0;
  function show(next) {
    index = (next + items.length) % items.length;
    var item = items[index];
    image.src = item.src;
    image.alt = item.alt;
    if (caption) caption.textContent = item.label;
    if (counter) counter.textContent = (index + 1) + ' / ' + items.length;
    // Warm the neighbours so swiping feels instant.
    [1, -1].forEach(function (step) {
      var pre = new Image();
      pre.src = items[(index + step + items.length) % items.length].src;
    });
  }

  cards.forEach(function (card, i) {
    var link = card.querySelector('a');
    if (!link) return;
    link.addEventListener('click', function (event) {
      event.preventDefault();
      show(i);
      if (typeof dialog.showModal === 'function') dialog.showModal();
    });
  });

  var prev = document.getElementById('galleryPrev');
  var next = document.getElementById('galleryNext');
  var close = document.getElementById('galleryClose');
  if (prev) prev.addEventListener('click', function () { show(index - 1); });
  if (next) next.addEventListener('click', function () { show(index + 1); });
  if (close) close.addEventListener('click', function () { dialog.close(); });

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });

  var startX = null;
  image.addEventListener('touchstart', function (event) {
    if (event.changedTouches.length) startX = event.changedTouches[0].clientX;
  }, { passive: true });
  image.addEventListener('touchend', function (event) {
    if (startX === null || !event.changedTouches.length) return;
    var dx = event.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) < 42) return;
    if (dx < 0) show(index + 1); else show(index - 1);
  }, { passive: true });
})();
