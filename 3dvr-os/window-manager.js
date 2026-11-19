(function (root) {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  // At least 120px of the titlebar remains reachable; vertical titlebar never leaves view.
  function recover(rect, area) {
    const width = Math.min(rect.width, area.width);
    const height = Math.min(rect.height, area.height);
    const grip = Math.min(120, width, area.width);
    return { width, height, left: clamp(rect.left, grip - width, area.width - grip), top: clamp(rect.top, 0, Math.max(0, area.height - 40)) };
  }
  // Placement/recovery fully fits windows; only deliberate dragging uses recover().
  function fit(rect, area) {
    const width = Math.max(0, Math.min(rect.width, area.width));
    const height = Math.max(0, Math.min(rect.height, area.height));
    return { width, height, left: clamp(rect.left, 0, Math.max(0, area.width - width)), top: clamp(rect.top, 0, Math.max(0, area.height - height)) };
  }
  function startupLayout(area) {
    const gap = 16, inset = 12;
    const height = Math.min(510, Math.max(0, area.height - inset * 2));
    if (area.width >= 1000) {
      const width = (area.width - inset * 2 - gap) / 2;
      return { sparks: { left: inset, top: inset, width, height }, terminal: { left: inset + width + gap, top: inset, width, height } };
    }
    const box = fit({ left: inset, top: inset, width: Math.min(490, area.width - inset * 2), height }, area);
    return { sparks: { ...box }, terminal: { ...box } };
  }
  function layout(mode, area) {
    const width = mode === 'maximize' ? area.width : area.width / 2;
    return { left: mode === 'right' ? area.width - width : 0, top: 0, width, height: area.height };
  }
  if (typeof module !== 'undefined') module.exports = { recover, fit, startupLayout, layout };
  if (!root.document) return;
  const doc = root.document, workspace = doc.getElementById('workspace');
  const windows = [...workspace.querySelectorAll('.window')];
  const states = new WeakMap();
  const area = () => ({ width: workspace.clientWidth, height: workspace.clientHeight });
  const rect = win => {
    const box = win.getBoundingClientRect(), parent = workspace.getBoundingClientRect();
    return { left: box.left - parent.left, top: box.top - parent.top, width: box.width, height: box.height };
  };
  function apply(win, box) {
    for (const key of ['left', 'top', 'width', 'height']) win.style[key] = `${box[key]}px`;
  }
  function arrange(win, mode) {
    if (root.innerWidth <= 680) return; // Mobile uses full-window presentation.
    const state = states.get(win);
    if (mode === 'restore') {
      if (state.saved) apply(win, fit(state.saved, area()));
      state.mode = ''; state.saved = null;
    } else {
      if (!state.mode) state.saved = rect(win);
      state.mode = mode;
      apply(win, layout(mode, area()));
    }
  }
  for (const win of windows) {
    const state = { mode: '', saved: null, drag: null };
    states.set(win, state);
    let wasOpen = win.classList.contains('open');
    new root.MutationObserver(() => {
      const isOpen = win.classList.contains('open');
      if (isOpen && !wasOpen) apply(win, state.mode ? layout(state.mode, area()) : fit(rect(win), area()));
      wasOpen = isOpen;
    }).observe(win, { attributes: true, attributeFilter: ['class'] });
    const bar = win.querySelector('.titlebar'), controls = win.querySelector('.window-actions');
    for (const [mode, label, glyph] of [['left','Tile left','◧'],['right','Tile right','◨'],['maximize','Maximize','□'],['restore','Restore','↙']]) {
      const button = doc.createElement('button');
      button.type = 'button'; button.textContent = glyph; button.className = 'window-arrange';
      button.title = label; button.setAttribute('aria-label', label);
      button.addEventListener('click', () => arrange(win, mode));
      controls.insertBefore(button, controls.firstChild);
    }
    bar.addEventListener('pointerdown', event => {
      if (event.target.closest('button') || event.button !== 0 || root.innerWidth <= 680) return;
      if (state.mode) arrange(win, 'restore');
      const box = rect(win);
      state.drag = { x: event.clientX, y: event.clientY, box };
      bar.setPointerCapture(event.pointerId);
    });
    bar.addEventListener('pointermove', event => {
      if (!state.drag) return;
      const { x, y, box } = state.drag;
      apply(win, recover({ ...box, left: box.left + event.clientX - x, top: box.top + event.clientY - y }, area()));
    });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) bar.addEventListener(event, () => { state.drag = null; });
  }
  // Scripts load after the inline startup opens both apps: normalize them now.
  const initial = startupLayout(area());
  for (const win of windows) {
    if (!win.classList.contains('open')) continue;
    apply(win, initial[win.dataset.app] || fit(rect(win), area()));
  }
  doc.addEventListener('keydown', event => {
    const mode = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'maximize', ArrowDown: 'restore' }[event.key];
    if (root.innerWidth <= 680 || !event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !mode || doc.querySelector('.palette-wrap.open')) return;
    const win = workspace.querySelector('.window.open.focused');
    if (!win) return;
    event.preventDefault(); arrange(win, mode);
  });
  root.addEventListener('resize', () => {
    for (const win of windows) {
      if (!win.classList.contains('open')) continue;
      const state = states.get(win);
      apply(win, state.mode ? layout(state.mode, area()) : fit(rect(win), area()));
    }
  });
  // CSS excludes desktop chrome. Clamp only selections crossing an app boundary.
  // Native selection, copying, and text-control ranges wholly inside an app are untouched.
  doc.addEventListener('selectionchange', () => {
    const selection = root.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return;
    const element = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
    const body = element?.closest('.window-body');
    if (!body || body.contains(selection.focusNode)) return;
    const forward = Boolean(selection.anchorNode.compareDocumentPosition(selection.focusNode) & 4);
    const range = doc.createRange(); range.selectNodeContents(body); range.collapse(!forward);
    selection.setBaseAndExtent(selection.anchorNode, selection.anchorOffset, range.startContainer, range.startOffset);
  });
})(globalThis);

