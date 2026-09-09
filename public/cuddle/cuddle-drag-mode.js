// public/cuddle/cuddle-drag-mode.js — Cuddle Drag Mode
//
// Cuddle's ordinary gesture is a tap: tap a hand card and it's appended to
// the end of the current word, tap a filled draft tile and it's pulled back
// out to your hand. That's still exactly what a plain tap does. This adds
// an alternative: drag a hand card (or an already-placed draft tile) onto a
// specific board tile and it lands AT that position instead of wherever the
// word currently ends. Only the tile dropped on changes (and, for a move,
// the tile left behind) -- nothing else on the row shifts.
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
  let startX = 0, startY = 0;
  let dragEl = null;
  let hoverTile = null;
  let swallowClickUntil = 0;

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

  // touch-action:none (see cuddle.css) stops the browser's own panning, but
  // it doesn't stop the trailing compatibility "click" the platform
  // synthesizes once a real drag lifts. Left alone that click re-runs the
  // ordinary tap gesture on top of the placement Drag Mode just made -- the
  // hand card gets appended a second time at the first open tile, so a drop
  // on tile 4 also fills tile 1.
  //
  // It can't be swallowed by a listener on the source element: onUp
  // repaints #cuddleRoot's contents before the click lands, so that element
  // is already detached and the browser retargets the click to whatever now
  // sits under the finger. Swallow it on `window` in the capture phase
  // instead -- ahead of cuddle-ui.js's own handler, which is bound to
  // #cuddleRoot itself (that node survives the repaint) -- keyed on nothing
  // but a short time window.
  function swallowNextClick() {
    swallowClickUntil = Date.now() + 700;
  }

  window.addEventListener("click", event => {
    if (!swallowClickUntil || Date.now() > swallowClickUntil) return;
    swallowClickUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

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
    const wasDragging = !!dragEl;
    cleanup();

    if (!wasDragging) return; // a plain tap: cuddle-ui.js's own click handler acts as always

    const game = activeGame();
    if (!game) return;

    const rawIndex = tile ? Number(tile.dataset.dragIndex) : NaN;
    const targetIndex = Number.isInteger(rawIndex) ? rawIndex : null;

    // A tile dropped back onto itself is what a tap looks like when the
    // finger drifted past the threshold on the way up -- common on touch.
    // Leave it completely alone: no state change, no repaint, and no click
    // suppression, so the trailing click still reaches cuddle-ui.js and
    // removes that letter exactly as an undrifted tap would have.
    if (sourceIndex !== null && sourceIndex === targetIndex) return;

    if (sourceIndex !== null) {
      // A tile dragged clear of the row is the player physically pulling
      // that letter back out; removeDraftAt empties just that tile rather
      // than shifting the rest of the row left.
      if (targetIndex === null) game.removeDraftAt(sourceIndex);
      else game.moveDraftCard(sourceIndex, targetIndex);
    } else if (targetIndex !== null && glyph) {
      const card = resolveHandCardForPlacement(game, glyph);
      if (card) game.insertDraftCardAt(card.id, targetIndex);
    }
    // Reached on a real drag, including a hand card dropped clear of every
    // tile -- that means "cancel", so the trailing click must not fall
    // through and append the letter anyway.
    swallowNextClick();
    requestRerender(game);
  }

  function cleanup() {
    pendingGlyph = null;
    pendingSourceIndex = null;
    dragEl?.remove();
    dragEl = null;
    setHoverTile(null);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", cleanup);
  }

  function arm(glyph, sourceIndex, x, y) {
    pendingGlyph = glyph;
    pendingSourceIndex = sourceIndex;
    startX = x;
    startY = y;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", cleanup);
  }

  document.addEventListener("pointerdown", event => {
    // Any fresh gesture cancels a pending suppression, so the only click
    // that can ever be swallowed is the compatibility one belonging to the
    // drag that just ended -- a real tap always opens with its own
    // pointerdown and can never be eaten by a stale window.
    swallowClickUntil = 0;

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
      arm(letter, index, event.clientX, event.clientY);
      return;
    }

    const card = event.target.closest?.("[data-card-glyph]");
    if (card && !card.disabled) {
      arm(card.dataset.cardGlyph, null, event.clientX, event.clientY);
    }
  });
})();
