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
  const setFilterBar = document.querySelector('#afterDarkSetFilters');
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

  function slugOf(src) {
    const base = String(src || '').split('/').pop() || '';
    return base.replace(/\.[^.]*$/, '');
  }

  function render() {
    const item = items[index];
    if (!item || !dialogImage) return;
    if (item.src && item.src.includes('/after-dark/')) {
      const target = `#after-dark/${slugOf(item.src)}`;
      if (location.hash !== target) history.replaceState(null, '', target);
    }
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
  dialog?.addEventListener('close', () => {
    if (/^#after-dark\/.+/.test(location.hash)) {
      history.replaceState(null, '', '#after-dark');
    }
  });
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

  /* The private set reveals itself as you scroll, like the public
     archive: the filters pick who and which set, and the next chunk
     renders on its own as the bottom of the grid approaches — nobody
     has to click to see more frames. Only the first chunk renders up
     front, so the page stays light. Locked visitors never see the
     grid or the sentinel at all — the curtain behavior is unchanged. */
  const AD_PAGE = 12;
  let adFilter = 'all';
  let adSetFilter = 'all';
  let adShown = AD_PAGE;
  /* Without IntersectionObserver there is no scroll trigger, so the
     gallery simply shows everything the filters select. */
  const adRevealAll = !('IntersectionObserver' in window);
  const adSentinel = document.createElement('div');
  adSentinel.className = 'scroll-sentinel';
  adSentinel.hidden = true;
  adSentinel.setAttribute('aria-hidden', 'true');
  grid.after(adSentinel);

  function cardTags(card) {
    return (card.dataset.tags || '').split(/\s+/).filter(Boolean);
  }

  function cardMatches(card) {
    const whoMatches = adFilter === 'all' || cardTags(card).includes(adFilter);
    const setMatches = adSetFilter === 'all' || card.dataset.set === adSetFilter;
    return whoMatches && setMatches;
  }

  function applyAdVisibility() {
    let seen = 0;
    let total = 0;
    cards.forEach(card => {
      if (!cardMatches(card)) {
        card.hidden = true;
        return;
      }
      total += 1;
      card.hidden = !adRevealAll && seen >= adShown;
      seen += 1;
    });
    adSentinel.hidden = adRevealAll || total <= adShown;
  }

  /* Reveal the next chunk whenever the grid's end is near the
     viewport or already past it, so continuous scrolling and jumps
     to the bottom both keep the frames coming. */
  function revealAdChunks() {
    if (adRevealAll || adSentinel.hidden || !adSentinel.getClientRects().length) return;
    const rect = adSentinel.getBoundingClientRect();
    if (rect.top > window.innerHeight + 900) return;
    adShown += AD_PAGE;
    applyAdVisibility();
    revealAdChunks();
  }

  if (!adRevealAll) {
    const adObserver = new IntersectionObserver(() => revealAdChunks(), { rootMargin: '900px 0px' });
    adObserver.observe(adSentinel);
    window.addEventListener('scroll', revealAdChunks, { passive: true });
  }

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

  /* Two rows of chips, and they combine: who is in the frame (from
     each card's tags, which follow its caption) and which set the
     frame belongs to (each card's data-set, derived from its batch:
     the eve- frames split into the evening's dancing, yoga, and
     tantric themes; srv- is the Nov 4 serverless batch; anc- the
     Nov 5 anchored batch; the rest follow their recorded tags). */
  const AD_FILTERS = [
    ['all', 'All'],
    ['girl', '3DVR Girl'],
    ['kayla', 'Kayla'],
    ['garden', 'Garden muse'],
    ['explorer', 'Explorer'],
    ['muse', 'Muse']
  ];

  const AD_SET_FILTERS = [
    ['all', 'All sets'],
    ['dancing', 'Dancing'],
    ['yoga', 'Yoga'],
    ['tantric', 'Tantric'],
    ['portraits', 'Portraits'],
    ['duos', 'Duos'],
    ['fantasy', 'Fantasy'],
    ['machine', 'The machine'],
    ['serverless', 'Serverless batch'],
    ['anchored', 'Anchored batch'],
    ['first-takes', 'First takes']
  ];

  function syncFilterBar(bar, current) {
    bar?.querySelectorAll('.filter-button').forEach(button => {
      const active = button.dataset.tag === current;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setAdFilter(tag) {
    adFilter = tag;
    adShown = AD_PAGE;
    syncFilterBar(filterBar, adFilter);
    applyAdVisibility();
    revealAdChunks();
  }

  function setAdSetFilter(set) {
    adSetFilter = set;
    adShown = AD_PAGE;
    syncFilterBar(setFilterBar, adSetFilter);
    applyAdVisibility();
    revealAdChunks();
  }

  function buildFilterBar(bar, options, countFor, onPick) {
    if (!bar || bar.childElementCount) return;
    options.forEach(([tag, label]) => {
      const count = countFor(tag);
      if (tag !== 'all' && !count) return;
      const button = document.createElement('button');
      button.className = 'filter-button';
      button.type = 'button';
      button.dataset.tag = tag;
      button.setAttribute('aria-pressed', String(tag === 'all'));
      if (tag === 'all') button.classList.add('is-active');
      button.textContent = count ? `${label} · ${count}` : label;
      button.addEventListener('click', () => onPick(tag));
      bar.append(button);
    });
  }

  function buildFilters() {
    buildFilterBar(filterBar, AD_FILTERS,
      tag => (tag === 'all' ? cards.length : cards.filter(card => cardTags(card).includes(tag)).length),
      setAdFilter);
    buildFilterBar(setFilterBar, AD_SET_FILTERS,
      set => (set === 'all' ? cards.length : cards.filter(card => card.dataset.set === set).length),
      setAdSetFilter);
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
    if (setFilterBar) setFilterBar.hidden = !open;
    if (open) {
      buildFilters();
      applyAdVisibility();
      revealAdChunks();
    } else {
      adSentinel.hidden = true;
    }
    openFromHash();
  }

  /* Deep links: #after-dark/<slug> opens the viewer on that photo, where
     the slug is the image file name without directory or extension. */
  let lastAutoOpenedHash = '';

  function openFromHash() {
    const match = location.hash.match(/^#after-dark\/(.+)$/);
    if (!match) return;
    if (location.hash === lastAutoOpenedHash) return;
    if (!signedIn() || dialog?.open) return;
    const card = cards.find(candidate => slugOf(cardItem(candidate).src) === match[1]);
    if (!card) return;
    lastAutoOpenedHash = location.hash;
    setAdFilter('all');
    setAdSetFilter('all');
    adShown = cards.length;
    applyAdVisibility();
    openViewer(cards.map(cardItem), cards.indexOf(card));
  }

  refresh();
  window.addEventListener('storage', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('hashchange', openFromHash);
})();
