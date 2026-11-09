// The After dark gallery stays shut until the visitor is signed in to the
// portal on this device, using the same shared-identity check as the other
// portal tools. It keeps casual eyes out. The image files themselves live
// in the open repo, so this is a curtain, not a vault.
//
// The full-screen viewer is shared: window.PortalViewer serves both this
// gallery and the public scene archive (app.js delegates its photo clicks
// here). It supports swipe / arrow / keyboard navigation, pinch and
// double-tap zoom, wheel zoom on desktop, and drag panning while zoomed.
// The gestures, the in-viewer section bar and picture search come from
// viewer.js, shared with the character pages.
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
  let currentSection = null;
  let viewerChrome = null;

  /* Zoom, pan and swipe come from viewer.js, shared with the
     character pages; without it the viewer still opens and steps. */
  const zoom = dialogImage && window.LadiesViewer
    ? window.LadiesViewer.attachZoom(dialogImage, { onSwipe: dir => step(dir) })
    : { reset() {}, isZoomed: () => false };

  function resetZoom() {
    zoom.reset();
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

  function openViewer(list, start, section) {
    if (!dialog || !dialogImage || !list.length) return;
    items = list;
    index = Math.min(Math.max(start || 0, 0), list.length - 1);
    if (section) currentSection = section;
    render();
    viewerChrome?.refresh();
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
    const target = event.target;
    if (target && (target.matches?.('input, textarea, select') || target.isContentEditable)) return;
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });

  /* ---------- In-viewer sections + search (viewer.js chrome) ----------
     The bar jumps between the shelves without leaving full screen,
     and search runs over the same catalogue. After dark only takes
     part when the curtain is open for this visitor, exactly as the
     stage treats it: while it is locked its pictures stay out of the
     results, and picking its section lands on the curtain. */
  function viewerSections() {
    const data = window.LadiesGalleryData || {};
    const sections = [];
    if (data.archive?.length) sections.push({ id: 'archive', label: 'Archive', items: data.archive });
    if (data.goldenHour?.length) sections.push({ id: 'goldenhour', label: 'Golden hour', items: data.goldenHour });
    const open = signedIn();
    sections.push({
      id: 'afterdark',
      label: 'After dark',
      locked: !open,
      items: open ? cards.map(card => {
        const item = cardItem(card);
        item.search = [card.dataset.tags || '', card.dataset.set || '', 'after dark'].join(' ');
        return item;
      }) : []
    });
    return sections;
  }

  function pickViewerSection(section) {
    if (section.locked) {
      dialog?.close();
      window.LadiesHud?.activateStage('afterdark');
      return;
    }
    if (!section.items?.length) return;
    items = section.items;
    index = 0;
    currentSection = section.id;
    render();
    viewerChrome?.refresh();
  }

  function viewerSearch(query) {
    const found = [];
    for (const section of viewerSections()) {
      if (section.locked || !section.items?.length) continue;
      for (const item of window.LadiesViewer.searchItems(section.items, query)) {
        found.push({ sectionId: section.id, index: section.items.indexOf(item), item });
      }
    }
    return found;
  }

  function pickViewerResult(result) {
    const section = viewerSections().find(entry => entry.id === result.sectionId);
    if (!section || section.locked || !section.items?.length) return;
    items = section.items;
    index = Math.min(Math.max(result.index || 0, 0), items.length - 1);
    currentSection = section.id;
    render();
    viewerChrome?.refresh();
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
    /* Scrolls can come from the window or from the HUD stage panel;
       a capturing document listener hears both. */
    document.addEventListener('scroll', revealAdChunks, { passive: true, capture: true });
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
      openViewer(list.map(cardItem), list.indexOf(card), 'afterdark');
    });
  });

  /* Two rows of chips, and they combine: who is in the frame (from
     each card's tags, which follow its caption) and which set the
     frame belongs to (each card's data-set, derived from its batch:
     the eve- frames split into the evening's dancing, yoga, and
     tantric themes; srv- is the Nov 4 serverless batch; anc- the
     Nov 5 anchored batch; fst- and fn- the Nov 6 festival batches; ang-, dev- and mix- the Nov 6 angels, devils and mixes batches; mrt- the Nov 7 Martha rig test; prg- the Nov 7 expecting batch; kun- the Nov 7 kundalini batch; the rest
     follow their recorded tags). */
  const AD_FILTERS = [
    ['all', 'All'],
    ['girl', '3DVR Girl'],
    ['kayla', 'Kayla'],
    ['garden', 'Garden muse'],
    ['explorer', 'Explorer'],
    ['muse', 'Muse'],
    ['martha', 'Martha']
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
    ['festival', 'Festival'],
    ['angels', 'Angels'],
    ['devils', 'Devils'],
    ['mixes', 'Mixes'],
    ['martha', 'Martha'],
    ['expecting', 'Expecting'],
    ['kundalini', 'Kundalini'],
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
    viewerChrome?.refresh();
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
    openViewer(cards.map(cardItem), cards.indexOf(card), 'afterdark');
  }

  if (dialog && window.LadiesViewer) {
    viewerChrome = window.LadiesViewer.mountChrome(dialog, {
      sections: viewerSections,
      activeSection: () => currentSection,
      onSection: pickViewerSection,
      search: viewerSearch,
      onResult: pickViewerResult
    });
  }

  refresh();
  window.addEventListener('storage', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('hashchange', openFromHash);
})();
