// Shared tools for the Ladies full-screen picture viewers, used by
// the world page (gallery.js) and the character pages
// (character/app.js) alike:
//
//   attachZoom(img, { onSwipe }) — the gesture engine: pinch and
//     wheel zoom, double-tap / double-click to toggle zoom, drag to
//     pan while zoomed, horizontal swipe to step when not zoomed.
//   searchItems(items, query) — word matching over the words a
//     picture carries (label, alt text, copy, extra search text).
//   mountChrome(dialog, options) — the in-viewer chrome: a section
//     bar that jumps between picture sections without leaving
//     full screen, and a search panel over the page's catalogue.
//
// A section the visitor has not unlocked (After dark behind its
// curtain) is reported by the page as locked: the bar shows it with
// a lock, search never returns its pictures, and picking it hands
// back to the page, which shows the curtain exactly as the stage
// does. This module never decides access; it only renders what the
// page tells it.
(() => {
  function attachZoom(img, { onSwipe } = {}) {
    let scale = 1;
    let panX = 0;
    let panY = 0;
    const dialog = img.closest('dialog');

    function applyTransform() {
      img.style.transform = scale === 1 ? '' : `translate(${panX}px, ${panY}px) scale(${scale})`;
      dialog?.classList.toggle('is-zoomed', scale > 1);
    }

    function clampPan() {
      const maxX = img.clientWidth * 0.6;
      const maxY = img.clientHeight * 0.6;
      panX = Math.min(Math.max(panX, -maxX), maxX);
      panY = Math.min(Math.max(panY, -maxY), maxY);
    }

    function setScale(next) {
      scale = Math.min(4, Math.max(1, next));
      if (scale === 1) {
        panX = 0;
        panY = 0;
      }
      clampPan();
      applyTransform();
    }

    function reset() {
      scale = 1;
      panX = 0;
      panY = 0;
      applyTransform();
    }

    function toggleZoom() {
      if (scale > 1) reset();
      else setScale(2.5);
    }

    img.draggable = false;
    const pointers = new Map();
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let dragStart = null;
    let lastTap = 0;
    let lastToggleAt = 0;

    const distance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    img.addEventListener('pointerdown', event => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try {
        img.setPointerCapture(event.pointerId);
      } catch {
        /* an already-released pointer: the gesture still tracks */
      }
      if (pointers.size === 2) {
        pinchStartDist = distance();
        pinchStartScale = scale;
        dragStart = null;
      } else if (pointers.size === 1) {
        dragStart = { x: event.clientX, y: event.clientY, panX, panY, moved: false };
      }
    });
    img.addEventListener('pointermove', event => {
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
        onSwipe?.(dx < 0 ? 1 : -1);
      } else if (isTap) {
        const now = Date.now();
        if (now - lastTap < 300) {
          toggleZoom();
          lastToggleAt = now;
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
      dragStart = null;
    };
    img.addEventListener('pointerup', endPointer);
    img.addEventListener('pointercancel', endPointer);
    img.addEventListener('wheel', event => {
      event.preventDefault();
      setScale(scale * Math.exp(-event.deltaY * 0.0015));
    }, { passive: false });
    img.addEventListener('dblclick', () => {
      /* A double-tap toggles through the pointer path above, and
         the browser still sends dblclick for the same gesture;
         toggling again would undo the zoom before it can be seen.
         (This is why double-tap never appeared to work.) */
      if (Date.now() - lastToggleAt < 500) return;
      toggleZoom();
    });

    return { reset, isZoomed: () => scale > 1 };
  }

  function searchItems(items, query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return items.filter(item => {
      const haystack = [item.label, item.alt, item.copy, item.search]
        .filter(Boolean).join(' ').toLowerCase();
      return words.every(word => haystack.includes(word));
    });
  }

  function mountChrome(dialog, options) {
    const bar = document.createElement('div');
    bar.className = 'viewer-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Picture sections');

    const panel = document.createElement('div');
    panel.className = 'viewer-search';
    panel.hidden = true;
    const input = document.createElement('input');
    input.className = 'viewer-search__input';
    input.type = 'search';
    input.placeholder = 'Search pictures: a name, a set, a place…';
    input.setAttribute('aria-label', 'Search pictures');
    const results = document.createElement('div');
    results.className = 'viewer-search__results';
    const empty = document.createElement('p');
    empty.className = 'viewer-search__empty';
    empty.textContent = 'No pictures match that yet.';
    empty.hidden = true;
    panel.append(input, results, empty);

    const searchToggle = document.createElement('button');
    searchToggle.type = 'button';
    searchToggle.className = 'viewer-bar__button viewer-bar__button--search';
    searchToggle.textContent = 'Search';
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.addEventListener('click', () => {
      if (panel.hidden) openSearch();
      else closeSearch();
    });

    function openSearch() {
      panel.hidden = false;
      searchToggle.setAttribute('aria-expanded', 'true');
      runSearch();
      input.focus();
    }

    function closeSearch() {
      panel.hidden = true;
      searchToggle.setAttribute('aria-expanded', 'false');
    }

    function runSearch() {
      const found = options.search(input.value) || [];
      results.replaceChildren(...found.slice(0, 48).map(result => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'viewer-search__result';
        const thumb = document.createElement('img');
        thumb.src = result.item.src;
        thumb.alt = '';
        thumb.loading = 'lazy';
        const label = document.createElement('span');
        label.textContent = result.item.label || result.item.alt || '';
        button.append(thumb, label);
        button.addEventListener('click', () => {
          closeSearch();
          options.onResult(result);
        });
        return button;
      }));
      empty.hidden = !(input.value.trim() && !found.length);
    }
    input.addEventListener('input', runSearch);

    function refresh() {
      const active = options.activeSection();
      const buttons = options.sections().map(section => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'viewer-bar__button';
        button.dataset.section = section.id;
        if (section.locked) {
          button.dataset.locked = 'true';
          button.textContent = `${section.label} 🔒`;
          button.setAttribute('aria-label', `${section.label} (locked)`);
        } else {
          button.textContent = section.label;
        }
        const on = section.id === active;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', String(on));
        button.addEventListener('click', () => options.onSection(section));
        return button;
      });
      bar.replaceChildren(...buttons, searchToggle);
      if (!panel.hidden) runSearch();
    }

    dialog.addEventListener('cancel', event => {
      if (!panel.hidden) {
        event.preventDefault();
        closeSearch();
      }
    });
    dialog.addEventListener('close', closeSearch);

    dialog.append(bar, panel);
    refresh();
    return { refresh, closeSearch, isSearchOpen: () => !panel.hidden };
  }

  window.LadiesViewer = { attachZoom, searchItems, mountChrome };
})();
