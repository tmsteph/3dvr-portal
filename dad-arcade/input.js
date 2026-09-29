(function (global) {
  'use strict';

  function createArcadeInput(options) {
    const opts = options || {};
    const canvas = opts.canvas || null;
    const root = opts.root || document;
    const keyMap = opts.keyMap || {};
    const held = new Set();
    const pressed = new Set();
    const pointer = { x: 0.5, y: 0.5, active: false, type: 'mouse' };
    const buttonPointers = new Map();

    const mapCode = code => {
      const value = keyMap[code];
      return Array.isArray(value) ? value : value ? [value] : [];
    };

    const editable = target => target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    );

    function onKeyDown(event) {
      if (editable(event.target)) return;
      const actions = mapCode(event.code);
      if (!actions.length) return;
      event.preventDefault();
      actions.forEach(action => {
        if (!held.has(action)) pressed.add(action);
        held.add(action);
      });
    }

    function onKeyUp(event) {
      const actions = mapCode(event.code);
      if (!actions.length) return;
      event.preventDefault();
      actions.forEach(action => held.delete(action));
    }

    function clearKeys() {
      held.clear();
      pressed.clear();
      buttonPointers.clear();
    }

    function setPointer(event, active) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      pointer.y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      pointer.active = active;
      pointer.type = event.pointerType || 'mouse';
    }

    function onPointerMove(event) {
      setPointer(event, pointer.active);
    }

    function onPointerDown(event) {
      if (!canvas || event.target !== canvas) return;
      setPointer(event, true);
    }

    function onPointerUp(event) {
      if (!canvas) return;
      setPointer(event, false);
    }

    const cleanup = [];
    root.addEventListener('keydown', onKeyDown, { passive: false });
    root.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', clearKeys);
    cleanup.push(() => root.removeEventListener('keydown', onKeyDown));
    cleanup.push(() => root.removeEventListener('keyup', onKeyUp));
    cleanup.push(() => window.removeEventListener('blur', clearKeys));

    if (canvas) {
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      cleanup.push(() => canvas.removeEventListener('pointermove', onPointerMove));
      cleanup.push(() => canvas.removeEventListener('pointerdown', onPointerDown));
      cleanup.push(() => window.removeEventListener('pointerup', onPointerUp));
      cleanup.push(() => window.removeEventListener('pointercancel', onPointerUp));
    }

    root.querySelectorAll('[data-arcade-action]').forEach(button => {
      const action = button.dataset.arcadeAction;
      const down = event => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        buttonPointers.set(event.pointerId, action);
        if (!held.has(action)) pressed.add(action);
        held.add(action);
        button.dataset.active = 'true';
      };
      const up = event => {
        if (buttonPointers.get(event.pointerId) !== action) return;
        event.preventDefault();
        buttonPointers.delete(event.pointerId);
        const stillHeld = [...buttonPointers.values()].includes(action);
        if (!stillHeld) held.delete(action);
        button.dataset.active = stillHeld ? 'true' : 'false';
      };
      button.addEventListener('pointerdown', down);
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
      button.addEventListener('lostpointercapture', up);
      cleanup.push(() => button.removeEventListener('pointerdown', down));
      cleanup.push(() => button.removeEventListener('pointerup', up));
      cleanup.push(() => button.removeEventListener('pointercancel', up));
      cleanup.push(() => button.removeEventListener('lostpointercapture', up));
    });

    return {
      down(action) {
        return held.has(action);
      },
      consume(action) {
        const value = pressed.has(action);
        pressed.delete(action);
        return value;
      },
      pointer,
      clear: clearKeys,
      destroy() {
        clearKeys();
        cleanup.splice(0).forEach(fn => fn());
      }
    };
  }

  global.DadArcadeInput = { create: createArcadeInput };
})(window);
