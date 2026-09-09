// public/cuddle/cuddle-drag-mode.js — Cuddle Drag Mode
//
// Cuddle's ordinary gesture is a tap: tap a hand card and it's appended to
// the end of the current word, tap a filled draft tile and it's pulled back
// out to your hand. That's still exactly what a plain tap does. This adds
// an alternative: drag a hand card (or an already-placed draft tile) onto a
// specific board tile and it lands AT that position instead, shifting
// whatever else was there over -- rather than always landing wherever the
// word currently ends.
//
// Built on Pointer Events rather than native HTML5 drag-and-drop, same
// reasoning as the main game's client/drag-mode.js: native DnD has no
// reliable touch support on mobile, which this game targets, while Pointer
// Events unify mouse and touch behind one code path. Unlike that file,
// this one event-delegates from `document` instead of wiring a listener
// onto each element after every render -- Cuddle repaints #cuddleRoot's
// whole innerHTML on every state change instead of keeping a persistent
// DOM to attach to, so there is no stable element to wire once and reuse.
(function installCuddleDragMode() {
  "use strict";

  let pendingGlyph = null;
  // Set only when the drag originated from an already-placed draft tile
  // (not a hand card) -- null means "this is a hand-sourced drag/tap".
  let pendingSourceIndex = null;
  let pendingSourceEl = null;
  let startX = 0, startY = 0;
  let dragEl = null;
  let hoverTile = null;

  const DRAG_THRESHOLD = 8;

  function activeGame() {
    return window.CuddleCoachExpansion?.getActiveGame?.() || null;
  }

  function requestRerender(game) {
    // Same event coach-expansion dispatches after its own out-of-band
    // engine calls -- cuddle-ui.js listens for it and repaints, since these
    // engine calls happen outside its own click dispatcher (which repaints
    // unconditionally after every action it handles itself).
    window.dispatchEvent(new CustomEvent("cuddle:campaign-update", {
      detail: { runId: game?.state?.runId || null }
    }));
  }

  function setHoverTile(tile) {
    if (tile === hoverTile) return;
    hoverTile?.classList.remove("drag-hover");
    hoverTile = tile || null;
    hoverTile?.classList.add("drag-hover");
  }

  // touch-action:none (see cuddle.css) stops the browser's own panning,
  // but on some mobile browsers/WebViews it doesn't reliably stop the
  // trailing compatibility "click" the platform synthesizes once a real
  // drag lifts -- which would immediately re-trigger whatever the source
  // element's own tap gesture means (append the hand card again, or pull
  // the tile back out) right after Drag Mode already placed it correctly.
  // Swallow exactly that one click, capture-phase, so it never reaches
  // cuddle-ui.js's own click handler.
  function suppressNextClick(el) {
    if (!el) return;
    const swallow = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    el.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 400);
  }

  function resolveHandCardForPlacement(game, glyph) {
    const state = game.state;
    const rank = source => (source === "infinite" ? 0 : source === "reward" ? 1 : 2);
    const cards = (state.hand || [])
      .filter(card => card.glyph === glyph)
      .sort((a, b) => rank(a.source) - rank(b.source) || a.id.localeCompare(b.id));
    const infinite = cards.find(card => game.isInfiniteCard(card));
    if (infinite) return infinite;
    // A finite card already sitting in the draft can't supply a second,
    // distinct occurrence -- skip past it to another physical copy of the
    // same glyph if one exists, same as the hand's own selection logic.
    return cards.find(card => !state.draft.includes(card.id)) || null;
  }

  function onMove(e) {
    if (!dragEl) {
      if (!pendingGlyph) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      dragEl = document.createElement("div");
      dragEl.className = "drag-letter-ghost cuddle-drag-letter-ghost";
      dragEl.textContent = pendingGlyph;
      document.body.appendChild(dragEl);
    }

    dragEl.style.left = `${e.clientX}px`;
    dragEl.style.top = `${e.clientY}px`;

    const under = document.elementFromPoint(e.clientX, e.clientY);
    const tile = under?.closest?.("#cuddleRoot .cuddle-tile[data-drag-index]") || null;
    setHoverTile(tile);
  }

  function onUp() {
    const tile = hoverTile;
    const glyph = pendingGlyph;
    const sourceIndex = pendingSourceIndex;
    const sourceEl = pendingSourceEl;
    const wasDragging = !!dragEl;
    cleanup();

    if (!wasDragging) return; // a plain tap: cuddle-ui.js's own click handler acts as always

    suppressNextClick(sourceEl);

    const game = activeGame();
    if (!game) return;

    if (!tile) {
      // Dropped outside every tile: a tile-sourced drag is the player
      // physically pulling an already-placed letter out, so remove it (a
      // hand-sourced drag that never found a tile just never places
      // anything, same as the main game's Drag Mode). removeDraftAt now
      // leaves that one tile empty rather than shifting the rest of the
      // row left.
      if (sourceIndex !== null) {
        game.removeDraftAt(sourceIndex);
        requestRerender(game);
      }
      return;
    }

    const targetIndex = Number(tile.dataset.dragIndex);
    if (!Number.isInteger(targetIndex)) return;

    if (sourceIndex !== null) {
      if (sourceIndex !== targetIndex) game.moveDraftCard(sourceIndex, targetIndex);
    } else if (glyph) {
      const card = resolveHandCardForPlacement(game, glyph);
      if (card) game.insertDraftCardAt(card.id, targetIndex);
    }
    requestRerender(game);
  }

  function cleanup() {
    pendingGlyph = null;
    pendingSourceIndex = null;
    pendingSourceEl = null;
    dragEl?.remove();
    dragEl = null;
    setHoverTile(null);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", cleanup);
  }

  function arm(glyph, sourceIndex, x, y, sourceEl) {
    pendingGlyph = glyph;
    pendingSourceIndex = sourceIndex;
    pendingSourceEl = sourceEl || null;
    startX = x;
    startY = y;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", cleanup);
  }

  document.addEventListener("pointerdown", event => {
    const root = document.getElementById("cuddleRoot");
    if (!root || !root.contains(event.target)) return;

    const game = activeGame();
    if (!game || game.state?.status !== "playing") return;

    // Mulligan mode's tap means "select this card to discard", not "place
    // this letter" -- Drag Mode only applies to the ordinary play gesture.
    // Read straight from the DOM (the class renderHand already puts on the
    // submit row) rather than reaching into cuddle-ui.js's own closure
    // state, which nothing outside that file has access to.
    if (root.querySelector(".cuddle-submit-row.is-mulligan-mode")) return;

    const tile = event.target.closest?.(".cuddle-tile[data-drag-index]");
    if (tile) {
      const index = Number(tile.dataset.dragIndex);
      const letter = tile.textContent?.trim();
      if (!Number.isInteger(index) || !letter) return; // nothing to drag off an empty tile
      arm(letter, index, event.clientX, event.clientY, tile);
      return;
    }

    const card = event.target.closest?.("[data-card-glyph]");
    if (card && !card.disabled) {
      arm(card.dataset.cardGlyph, null, event.clientX, event.clientY, card);
    }
  });
})();
