// The After dark gallery stays shut until the visitor is signed in to the
// portal on this device, using the same shared-identity check as the other
// portal tools. It keeps casual eyes out. The image files themselves live
// in the open repo, so this is a curtain, not a vault.
//
// The full-screen viewer is shared: window.PortalViewer serves both this
// gallery and the public scene archive (app.js delegates its photo clicks
// here). It supports swipe / arrow / keyboard navigation, pinch and
// double-tap zoom, wheel zoom on desktop, and drag panning while zoomed.
(() => {
  const grid = document.querySelector('#afterDarkGrid');
  const lock = document.querySelector('#afterDarkLock');
  const filterBar = document.querySelector('#afterDarkFilters');
  if (!grid) return;

  const dialog = document.querySelector('#galleryDialog');
  const dialogImage = document.querySelector('#galleryImage');
  const captionEl = document.querySelector('#galleryCaption');
  const counterEl = document.querySelector('#galleryCounter');
  const copyEl = document.querySelector('#galleryItemCopy');
  const closeBtn = document.querySelector('#galleryClose');
  const prevBtn = document.querySelector('#galleryPrev');
  const nextBtn = document.querySelector('#galleryNext');

  /* ---------- shared full-screen viewer (After Dark + scene archive) ---------- */
  let items = [];
  let index = 0;
  let scale = 1;
  let panX = 0;
  let panY = 0;

  function applyTransform() {
    if (!dialogImage) return;
    dialogImage.style.transform = scale === 1 ? '' : `translate(${panX}px, ${panY}px) scale(${scale})`;
    dialog?.classList.toggle('is-zoomed', scale > 1);
  }

  function resetZoom() {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  function render() {
    const item = items[index];
    if (!item || !dialogImage) return;
    dialogImage.src = item.src;
    dialogImage.alt = item.alt || item.label || '';
    if (captionEl) captionEl.textContent = item.label || '';
    if (counterEl) counterEl.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
    if (copyEl) {
      copyEl.textContent = item.copy || '';
      copyEl.hidden = !item.copy;
    }
    resetZoom();
    [index - 1, index + 1].forEach(i => {
      if (items[i]) {
        const pre = new Image();
        pre.src = items[i].src;
      }
    });
  }

  function openViewer(list, start) {
    if (!dialog || !dialogImage || !list.length) return;
    items = list;
    index = Math.min(Math.max(start || 0, 0), list.length - 1);
    render();
    if (!dialog.open) dialog.showModal();
  }

  function step(delta) {
    if (items.length < 2) return;
    index = (index + delta + items.length) % items.length;
    render();
  }

  window.PortalViewer = { open: openViewer };

  closeBtn?.addEventListener('click', () => dialog?.close());
  prevBtn?.addEventListener('click', () => step(-1));
  nextBtn?.addEventListener('click', () => step(1));
  dialog?.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog?.addEventListener('close', resetZoom);
  document.addEventListener('keydown', event => {
    if (!dialog?.open) return;
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });

  /* Pointer gestures on the photo: swipe to navigate, pinch / double-tap /
     wheel to zoom, drag to pan while zoomed. */
  if (dialogImage) {
    dialogImage.draggable = false;
    const pointers = new Map();
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let dragStart = null;
    let lastTap = 0;

    const distance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const clampPan = () => {
      const maxX = dialogImage.clientWidth * 0.6;
      const maxY = dialogImage.clientHeight * 0.6;
      panX = Math.min(Math.max(panX, -maxX), maxX);
      panY = Math.min(Math.max(panY, -maxY), maxY);
    };
    const setScale = next => {
      scale = Math.min(4, Math.max(1, next));
      if (scale === 1) {
        panX = 0;
        panY = 0;
      }
      clampPan();
      applyTransform();
    };

    dialogImage.addEventListener('pointerdown', event => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      dialogImage.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        pinchStartDist = distance();
        pinchStartScale = scale;
        dragStart = null;
      } else if (pointers.size === 1) {
        dragStart = { x: event.clientX, y: event.clientY, panX, panY, moved: false };
      }
    });
    dialogImage.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && pinchStartDist > 0) {
        setScale(pinchStartScale * (distance() / pinchStartDist));
      } else if (pointers.size === 1 && dragStart && scale > 1) {
        panX = dragStart.panX + (event.clientX - dragStart.x);
        panY = dragStart.panY + (event.clientY - dragStart.y);
        if (Math.abs(event.clientX - dragStart.x) + Math.abs(event.clientY - dragStart.y) > 6) {
          dragStart.moved = true;
        }
        clampPan();
        applyTransform();
      }
    });
    const endPointer = event => {
      const wasPinch = pointers.size === 2;
      pointers.delete(event.pointerId);
      if (wasPinch) {
        pinchStartDist = 0;
        dragStart = null;
        return;
      }
      if (!dragStart) return;
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      const isTap = Math.abs(dx) < 6 && Math.abs(dy) < 6;
      if (scale === 1 && Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
        step(dx < 0 ? 1 : -1);
      } else if (isTap) {
        const now = Date.now();
        if (now - lastTap < 300) {
          if (scale > 1) resetZoom();
          else setScale(2.5);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
      dragStart = null;
    };
    dialogImage.addEventListener('pointerup', endPointer);
    dialogImage.addEventListener('pointercancel', endPointer);
    dialogImage.addEventListener('wheel', event => {
      event.preventDefault();
      setScale(scale * Math.exp(-event.deltaY * 0.0015));
    }, { passive: false });
    dialogImage.addEventListener('dblclick', () => {
      if (scale > 1) resetZoom();
      else setScale(2.5);
    });
  }

  /* ---------- After Dark: lock, filters, cards ---------- */
  const cards = [...grid.querySelectorAll('.private-card')];

  function visibleCards() {
    return cards.filter(card => !card.hidden);
  }

  function cardItem(card) {
    const link = card.querySelector('a');
    const img = card.querySelector('img');
    const who = card.querySelector('figcaption span')?.textContent?.trim() ?? '';
    const title = card.querySelector('figcaption strong')?.textContent?.trim() ?? '';
    return {
      src: link?.getAttribute('href') || img?.getAttribute('src') || '',
      alt: img?.getAttribute('alt') || title,
      label: [who, title].filter(Boolean).join(' · ')
    };
  }

  cards.forEach(card => {
    const link = card.querySelector('a');
    link?.addEventListener('click', event => {
      event.preventDefault();
      const list = visibleCards();
      openViewer(list.map(cardItem), list.indexOf(card));
    });
  });

  const AD_FILTERS = [
    ['all', 'All'],
    ['girl', '3DVR Girl'],
    ['kayla', 'Kayla'],
    ['garden', 'Garden muse'],
    ['explorer', 'Explorer'],
    ['muse', 'Muse'],
    ['duo', 'Duo'],
    ['machine', 'Machine'],
    ['fantasy', 'Fantasy']
  ];

  function setAdFilter(tag) {
    filterBar?.querySelectorAll('.filter-button').forEach(button => {
      const active = button.dataset.tag === tag;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    cards.forEach(card => {
      const tags = (card.dataset.tags || '').split(/\s+/).filter(Boolean);
      card.hidden = tag !== 'all' && !tags.includes(tag);
    });
  }

  function buildFilters() {
    if (!filterBar || filterBar.childElementCount) return;
    AD_FILTERS.forEach(([tag, label]) => {
      if (tag !== 'all' && !cards.some(card => (card.dataset.tags || '').split(/\s+/).includes(tag))) return;
      const button = document.createElement('button');
      button.className = 'filter-button';
      button.type = 'button';
      button.dataset.tag = tag;
      button.setAttribute('aria-pressed', String(tag === 'all'));
      if (tag === 'all') button.classList.add('is-active');
      button.textContent = label;
      button.addEventListener('click', () => setAdFilter(tag));
      filterBar.append(button);
    });
  }

  function signedIn() {
    try {
      if (window.AuthIdentity?.readSharedIdentity?.()) return true;
    } catch (error) {
      /* fall through to the flag check */
    }
    try {
      return window.localStorage.getItem('signedIn') === 'true';
    } catch (error) {
      return false;
    }
  }

  function refresh() {
    const open = signedIn();
    grid.hidden = !open;
    if (lock) lock.hidden = open;
    if (filterBar) filterBar.hidden = !open;
    if (open) buildFilters();
  }

  refresh();
  window.addEventListener('storage', refresh);
  window.addEventListener('focus', refresh);
})();
