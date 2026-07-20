// client/drag-mode.js — Setter "Drag Mode"
//
// Toggle at the top of the setter screen: while active, letters can be
// dragged straight from the on-screen keyboard onto a specific draft tile,
// as an alternative to typing them in order -- or dragged from one draft
// tile to another to relocate them (overwriting whatever was at the
// target). Built on Pointer Events rather than native HTML5
// drag-and-drop -- native DnD has no reliable touch support on mobile
// browsers, which this game targets, while Pointer Events unify mouse and
// touch behind one code path.
//
// A plain tap (pointerdown+pointerup with no real movement) never creates
// the drag ghost. On a keyboard key that falls through to the key's
// normal onclick and still types the letter. On a draft tile it instead
// toggles that tile's lock (see toggleSetterDraftLock in client.js) --
// dragging and locking share the same tap/drag distinction so one
// gesture cleanly does either depending on how far it moves.
(function () {
  let active = false;
  let pendingLetter = null;
  // Set only when the drag originated from a draft tile (not a keyboard
  // key) -- null means "this is a key-sourced drag/tap".
  let pendingSourceIndex = null;
  let startX = 0, startY = 0;
  let dragEl = null;
  let hoverTile = null;

  const DRAG_THRESHOLD = 8;

  window.isSetterDragModeActive = function () { return active; };

  window.toggleSetterDragMode = function () {
    active = !active;
    document.getElementById("dragModeBtnSetter")?.classList.toggle("active", active);
    document.getElementById("keyboardSetter")?.classList.toggle("drag-mode-active", active);
  };

  function setHoverTile(tile) {
    if (tile === hoverTile) return;
    hoverTile?.classList.remove("drag-hover");
    hoverTile = tile || null;
    hoverTile?.classList.add("drag-hover");
  }

  function onMove(e) {
    if (!dragEl) {
      if (!pendingLetter) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      dragEl = document.createElement("div");
      dragEl.className = "drag-letter-ghost";
      dragEl.textContent = pendingLetter;
      document.body.appendChild(dragEl);
    }

    dragEl.style.left = `${e.clientX}px`;
    dragEl.style.top = `${e.clientY}px`;

    const under = document.elementFromPoint(e.clientX, e.clientY);
    setHoverTile(under?.closest?.(".draft-tile[data-drag-index]") || null);
  }

  function onUp() {
    const tile = hoverTile;
    const letter = pendingLetter;
    const sourceIndex = pendingSourceIndex;
    const wasDragging = !!dragEl;
    cleanup();

    if (!wasDragging) {
      // Plain tap, no real drag. A key-sourced tap needs no action here --
      // the key's own click handler fires normally and types the letter.
      // A tile-sourced tap toggles that tile's lock instead.
      if (sourceIndex !== null) {
        window.toggleSetterDraftLock?.(sourceIndex);
      }
      return;
    }

    if (!tile || !letter) return;
    const targetIndex = Number(tile.dataset.dragIndex);
    if (sourceIndex !== null) {
      window.moveSetterDraftLetter?.(sourceIndex, targetIndex);
    } else {
      window.setSetterDraftLetterAt?.(targetIndex, letter);
    }
  }

  function cleanup() {
    pendingLetter = null;
    pendingSourceIndex = null;
    dragEl?.remove();
    dragEl = null;
    setHoverTile(null);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", cleanup);
  }

  function arm(letter, sourceIndex, x, y) {
    if (!active) return;
    pendingLetter = letter;
    pendingSourceIndex = sourceIndex;
    startX = x;
    startY = y;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", cleanup);
  }

  // Called from keyboard.js's pointerdown on a setter letter key.
  window.beginKeyDrag = function (letter, x, y) {
    arm(letter, null, x, y);
  };

  // Called from draftrow.js's pointerdown on a filled setter draft tile.
  window.beginTileDrag = function (index, letter, x, y) {
    arm(letter, index, x, y);
  };
})();
