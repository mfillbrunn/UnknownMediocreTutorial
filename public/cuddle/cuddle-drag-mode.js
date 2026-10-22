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
  // A hand card needs a longer pull before it counts as a drag: a quick
  // tap on a phone often slides a few pixels, and that used to start a
  // drag that dropped nowhere, so the tap was lost.
  const HAND_DRAG_THRESHOLD = 16;
  // A "drag" of a hand card that lands on no tile, this short, was a tap.
  const TAP_SLIP = 44;
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
    // Every hand letter can go into a word more than once (cuddle-engine.js
    // toggleDraftReusable), so a card already in the word can be dropped in
    // again: a spare copy first, else the same card.
    return reusable || matches.find((card) => !used.has(card.id)) || matches[0] || null;
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
      if (distance < (session.kind === "hand" ? HAND_DRAG_THRESHOLD : DRAG_THRESHOLD)) return;
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
    // Hints rank III's Test pad (cuddle-schools.js) takes a hand card.
    const pad = !tile && session.kind === "hand" && under && under.closest
      ? under.closest("#cuddleRoot [data-umt-test-drop]")
      : null;
    setHover(tile || pad);
  }

  function onUp(event) {
    if (!session || (session.pointerId != null && event.pointerId !== session.pointerId)) return;
    const ended = session;
    const target = hoverTile;
    const wasDragging = Boolean(ghost);
    cleanup();
    if (!wasDragging) return; // ordinary taps keep the original click behavior

    // A hand card slid a little and let go over no tile: pick it, as a tap.
    const slip = Math.hypot(event.clientX - ended.startX, event.clientY - ended.startY);
    if (ended.kind === "hand" && !target && slip < TAP_SLIP && ended.source && ended.source.isConnected && !ended.source.disabled) {
      event.preventDefault();
      ended.source.click();
      swallowClickUntil = Date.now() + 600;
      return;
    }

    // A compatibility click can be retargeted after the UI rerenders. Swallow
    // it globally instead of on the source element that is about to disappear.
    event.preventDefault();
    event.stopImmediatePropagation();
    swallowClickUntil = Date.now() + 1250;

    if (target && target.hasAttribute("data-umt-test-drop")) {
      const schools = window.CuddleSchools;
      if (schools && typeof schools.dropOnTestPad === "function") schools.dropOnTestPad(ended.glyph);
      return;
    }

    const game = activeGame();
    const rawIndex = target ? Number(target.dataset.dragIndex) : NaN;
    const targetIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < 5
      ? rawIndex
      : null;

    // The Duel keeps its own hand and word (cuddle-expanded-stages.js).
    if (ended.duel) {
      const stages = window.CuddleExpandedStages;
      if (game && stages && typeof stages.dragDuelTile === "function") {
        if (ended.kind === "draft") {
          if (targetIndex === null) stages.dragDuelTile(game, { kind: "remove", from: ended.sourceIndex });
          else if (targetIndex !== ended.sourceIndex) stages.dragDuelTile(game, { kind: "move", from: ended.sourceIndex, to: targetIndex });
        } else if (targetIndex !== null) {
          stages.dragDuelTile(game, { kind: "insert", glyph: ended.glyph, to: targetIndex });
        }
        requestRender(game);
      }
      return;
    }
    if (!game || !game.state || game.state.status !== "playing") return;
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
    if (root.querySelector(".cuddle-submit-row.is-mulligan-mode")) return;
    // A Duel tile: the run itself sits on the map meanwhile.
    const duelTarget = event.target.closest && event.target.closest("[data-duel-drag]");
    if (duelTarget) {
      if (duelTarget.disabled) return;
      if (duelTarget.dataset.dragIndex != null) {
        const index = Number(duelTarget.dataset.dragIndex);
        const glyph = String(duelTarget.textContent || "").trim();
        if (Number.isInteger(index) && glyph) begin(event, { kind: "draft", glyph, sourceIndex: index, duel: true });
      } else if (duelTarget.dataset.cardGlyph) {
        begin(event, { kind: "hand", glyph: duelTarget.dataset.cardGlyph, duel: true });
      }
      return;
    }
    if (!game || !game.state || game.state.status !== "playing" || game.state.roundIntroPending) return;

    const tile = event.target.closest && event.target.closest(".cuddle-tile[data-drag-index]");
    if (tile) {
      const index = Number(tile.dataset.dragIndex);
      const glyph = String(tile.textContent || "").trim();
      if (Number.isInteger(index) && glyph) begin(event, { kind: "draft", glyph, sourceIndex: index });
      return;
    }
    const card = event.target.closest && event.target.closest(".cuddle-card[data-card-glyph]");
    if (card && !card.disabled) begin(event, { kind: "hand", glyph: card.dataset.cardGlyph, source: card });
  }, true);

  // A tap that lands in the gap between two hand cards picks the nearer
  // one, when it is close: the cards sit a few pixels apart and a finger
  // is wider than that.
  const GAP_REACH = 10;
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(".cuddle-card") || !target.closest("#cuddleRoot .cuddle-hand")) return;
    const x = event.clientX;
    const y = event.clientY;
    if (!x && !y) return;
    let best = null;
    let bestDistance = GAP_REACH;
    target.closest(".cuddle-hand").querySelectorAll(".cuddle-card[data-card-glyph]:not([disabled])").forEach((card) => {
      const box = card.getBoundingClientRect();
      const dx = Math.max(box.left - x, 0, x - box.right);
      const dy = Math.max(box.top - y, 0, y - box.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance <= bestDistance) { best = card; bestDistance = distance; }
    });
    if (!best) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    best.click();
  }, true);
})();
