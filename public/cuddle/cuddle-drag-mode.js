// public/cuddle/cuddle-drag-mode.js -- user Cuddle drag fix
(function installCuddleDragModeUserFix() {
  "use strict";

  // cuddle-rebalance-v5.js contains a second drag controller that compacts the
  // draft. Mark it installed before that file loads, so only this positional
  // controller handles gestures.
  document.documentElement.dataset.umtCuddleDragV5 = "1";
  if (document.documentElement.dataset.umtCuddleDragUserFix === "1") return;
  document.documentElement.dataset.umtCuddleDragUserFix = "1";

  const DRAG_THRESHOLD = 8;
  let session = null;
  let ghost = null;
  let hoverTile = null;
  let swallowClickUntil = 0;

  function activeGame() {
    const providers = [
      window.CuddleRebalanceV5,
      window.CuddleBranchMap,
      window.CuddleMoneyMode,
      window.CuddleCoachExpansion,
      window.CuddleCampaign
    ];
    for (const provider of providers) {
      try {
        const game = provider && typeof provider.getActiveGame === "function"
          ? provider.getActiveGame()
          : null;
        if (game && game.state) return game;
      } catch (_error) {}
    }
    return null;
  }

  function requestRender(game) {
    try { if (typeof game.save === "function") game.save(); } catch (_error) {}
    try {
      window.dispatchEvent(new CustomEvent("cuddle:campaign-update", {
        detail: { runId: game && game.state ? game.state.runId : null }
      }));
    } catch (_error) {}
  }

  function setHover(tile) {
    if (tile === hoverTile) return;
    if (hoverTile) {
      hoverTile.classList.remove("drag-hover");
      hoverTile.classList.remove("umt-drag-hover");
    }
    hoverTile = tile || null;
    if (hoverTile) {
      hoverTile.classList.add("drag-hover");
      hoverTile.classList.add("umt-drag-hover");
    }
  }

  function resolveHandCard(game, glyph) {
    const state = game.state || {};
    const hand = Array.isArray(state.hand) ? state.hand : [];
    const used = new Set(Array.isArray(state.draft) ? state.draft.filter(Boolean) : []);
    const rank = (card) => card && card.source === "infinite" ? 0
      : card && card.source === "reward" ? 1 : 2;
    const matches = hand
      .filter((card) => card && String(card.glyph || "") === String(glyph || ""))
      .sort((a, b) => rank(a) - rank(b) || String(a.id || "").localeCompare(String(b.id || "")));
    const reusable = matches.find((card) => {
      try { return typeof game.isInfiniteCard === "function" && game.isInfiniteCard(card); }
      catch (_error) { return false; }
    });
    return reusable || matches.find((card) => !used.has(card.id)) || null;
  }

  function cleanup() {
    if (ghost) ghost.remove();
    ghost = null;
    setHover(null);
    session = null;
    document.removeEventListener("pointermove", onMove, { capture: true });
    document.removeEventListener("pointerup", onUp, { capture: true });
    document.removeEventListener("pointercancel", cancel, { capture: true });
  }

  function cancel() {
    cleanup();
  }

  function onMove(event) {
    if (!session || (session.pointerId != null && event.pointerId !== session.pointerId)) return;
    if (!ghost) {
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (distance < DRAG_THRESHOLD) return;
      ghost = document.createElement("div");
      ghost.className = "drag-letter-ghost cuddle-drag-letter-ghost umt-drag-letter-ghost";
      ghost.textContent = session.glyph;
      document.body.appendChild(ghost);
    }
    event.preventDefault();
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const tile = under && under.closest
      ? under.closest("#cuddleRoot .cuddle-tile[data-drag-index]")
      : null;
    setHover(tile);
  }

  function onUp(event) {
    if (!session || (session.pointerId != null && event.pointerId !== session.pointerId)) return;
    const ended = session;
    const target = hoverTile;
    const wasDragging = Boolean(ghost);
    cleanup();
    if (!wasDragging) return; // ordinary taps keep the original click behavior

    // A compatibility click can be retargeted after the UI rerenders. Swallow
    // it globally instead of on the source element that is about to disappear.
    event.preventDefault();
    event.stopImmediatePropagation();
    swallowClickUntil = Date.now() + 1250;

    const game = activeGame();
    if (!game || !game.state || game.state.status !== "playing") return;
    const rawIndex = target ? Number(target.dataset.dragIndex) : NaN;
    const targetIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < 5
      ? rawIndex
      : null;

    try {
      if (ended.kind === "draft") {
        if (targetIndex === null) {
          if (typeof game.removeDraftAt === "function") game.removeDraftAt(ended.sourceIndex);
        } else if (targetIndex !== ended.sourceIndex && typeof game.moveDraftCard === "function") {
          game.moveDraftCard(ended.sourceIndex, targetIndex);
        }
      } else if (targetIndex !== null) {
        const card = resolveHandCard(game, ended.glyph);
        if (card && typeof game.insertDraftCardAt === "function") {
          game.insertDraftCardAt(card.id, targetIndex);
        }
      }
    } finally {
      requestRender(game);
    }
  }

  function begin(event, data) {
    if (event.button !== undefined && event.button !== 0) return;
    session = {
      ...data,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    document.addEventListener("pointermove", onMove, { capture: true, passive: false });
    document.addEventListener("pointerup", onUp, { capture: true });
    document.addEventListener("pointercancel", cancel, { capture: true });
  }

  // Capture phase is essential: cuddle-ui.js listens below this level and
  // would otherwise append the same card after a successful drop.
  window.addEventListener("click", (event) => {
    if (!swallowClickUntil || Date.now() > swallowClickUntil) return;
    swallowClickUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener("pointerdown", (event) => {
    swallowClickUntil = 0;
    const root = document.getElementById("cuddleRoot");
    if (!root || !root.contains(event.target)) return;
    const game = activeGame();
    if (!game || !game.state || game.state.status !== "playing" || game.state.roundIntroPending) return;
    if (root.querySelector(".cuddle-submit-row.is-mulligan-mode")) return;

    const tile = event.target.closest && event.target.closest(".cuddle-tile[data-drag-index]");
    if (tile) {
      const index = Number(tile.dataset.dragIndex);
      const glyph = String(tile.textContent || "").trim();
      if (Number.isInteger(index) && glyph) begin(event, { kind: "draft", glyph, sourceIndex: index });
      return;
    }
    const card = event.target.closest && event.target.closest(".cuddle-card[data-card-glyph]");
    if (card && !card.disabled) begin(event, { kind: "hand", glyph: card.dataset.cardGlyph });
  }, true);
})();
