/* Cuddle: Fish Hook (a Rare Cards badge, cuddle-skill-tree.js).
 *
 * A mulliganed or played card goes to the discard pile and only comes back
 * once the deck runs out and is reshuffled. Fish Hook lets the player,
 * once a stage, pick one card out of the discard pile straight into the
 * hand. If the hand is full, they throw one of their cards back first (it
 * goes to the discard pile in its place).
 *
 * A small hook sits on the deck while it's ready; tapping it opens the
 * discard pile.
 *
 * Level 2: the caught letter is tested as it comes up. In the answer, it
 *   turns yellow (and, like every yellow letter, stays in your hand for
 *   good without taking a slot); not in it, it turns grey.
 * Level 3: also, once a stage, the hook bites on its own: as soon as a
 *   letter of the answer lands in the discard pile, it's hooked out and
 *   turns yellow.
 *
 * The Fishing Line quest reward (cuddle-powers.js) gives one catch for
 * the stage it's picked in, badge or not.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleFishHook) return;
  var proto = Game.prototype;
  proto.__cuddleFishHook = true;

  var ID = "fishHook";

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function level(game) {
    var tree = window.CuddleSkillTree;
    var node = tree && tree.findNode(ID);
    return node && game ? Number(tree.level(game, node)) || 0 : 0;
  }

  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  function usedThisStage(state) {
    var record = state.umtFishHook;
    return record && record.key === stageKey(state) ? Number(record.used) || 0 : 0;
  }

  function isLetter(card) {
    return Boolean(card && /^[A-Z]$/.test(String(card.glyph || "")));
  }

  // Letters in the discard pile, one entry per letter, with how many.
  function pond(game) {
    var counts = {};
    (game.state.discard || []).forEach(function add(card) {
      if (isLetter(card)) counts[card.glyph] = (counts[card.glyph] || 0) + 1;
    });
    return Object.keys(counts).sort().map(function entry(glyph) { return { glyph: glyph, count: counts[glyph] }; });
  }

  function handFull(game) {
    return typeof game.getCountedHandSize === "function" && typeof game.getHandLimit === "function"
      && game.getCountedHandSize() >= game.getHandLimit();
  }

  // Cards that can go back to make room: ones that count toward the hand
  // limit, aren't in the word being built, aren't a Joker, and aren't
  // frozen (cuddle-world-identity.js).
  function throwable(game) {
    var state = game.state;
    var identity = window.CuddleWorldIdentity;
    return (state.hand || []).filter(function ok(card) {
      if (!card || !card.glyph) return false;
      if (typeof game.cardCountsTowardHandLimit === "function" && !game.cardCountsTowardHandLimit(card)) return false;
      if (typeof game.isInfiniteCard === "function" && game.isInfiniteCard(card)) return false;
      if (card.source === "joker" || (state.draft || []).indexOf(card.id) !== -1) return false;
      if (identity && typeof identity.isFrozenGlyph === "function" && identity.isFrozenGlyph(game, card.glyph)) return false;
      return true;
    });
  }

  // Extra catches this stage (Fishing Line).
  function extraThisStage(state) {
    var line = state.umtFishLine;
    return line && line.key === stageKey(state) ? Number(line.count) || 0 : 0;
  }

  function addCatch(game) {
    var state = game && game.state;
    if (!state) return;
    state.umtFishLine = { key: stageKey(state), count: extraThisStage(state) + 1 };
  }

  // Manual catches this stage: one with the badge (any level), plus
  // Fishing Line's.
  function allowance(game) {
    return (level(game) > 0 ? 1 : 0) + extraThisStage(game.state);
  }

  function uniqueSorted(list) {
    return Array.from(new Set(list)).sort();
  }

  // The hook plays its own animation for what it teaches: the hint drop
  // (cuddle-hint-fx.js) counts that letter as already shown.
  function shownByHook(state, id) {
    var key = stageKey(state);
    if (!state.umtHintFx || state.umtHintFx.key !== key) state.umtHintFx = { key: key, seen: [], sources: {} };
    if (!Array.isArray(state.umtHintFx.seen)) state.umtHintFx.seen = [];
    if (state.umtHintFx.seen.indexOf(id) === -1) state.umtHintFx.seen.push(id);
  }

  function inAnswer(state, letter) {
    return String(state.secret || "").toUpperCase().indexOf(letter) !== -1;
  }

  // A letter known to be in the answer: yellow, and (cuddle-engine.js
  // _syncInfiniteCards) a card that stays in hand without taking a slot.
  function markPresent(game, letter) {
    var state = game.state;
    state.knownPresent = uniqueSorted((state.knownPresent || []).concat([letter]));
    shownByHook(state, "p:" + letter);
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
  }

  function ready(game) {
    var state = game && game.state;
    if (!state || inDuel(state) || state.status !== "playing" || state.pendingRoundEnd) return false;
    var copilot = window.CuddleCopilot;
    if (copilot && typeof copilot.aiTurn === "function" && copilot.aiTurn(game)) return false;
    return usedThisStage(state) < allowance(game) && pond(game).length > 0;
  }

  // Fishes one `glyph` out of the discard pile into the hand; `throwBackId`
  // names the hand card that makes room when the hand is full.
  proto.fishCard = function fishCard(glyph, throwBackId) {
    var state = this.state;
    if (!ready(this)) return { ok: false, error: "Fish Hook isn't ready right now." };
    var letter = String(glyph || "").toUpperCase();
    var index = (state.discard || []).findIndex(function match(card) { return isLetter(card) && card.glyph === letter; });
    if (index < 0) return { ok: false, error: "There's no " + letter + " in the discard pile." };
    var thrown = null;
    if (handFull(this)) {
      thrown = throwable(this).find(function match(card) { return card.id === throwBackId; }) || null;
      if (!thrown) return { ok: false, error: "Your hand is full: pick a card to throw back." };
    }
    var caught = state.discard.splice(index, 1)[0];
    state.umtFishHook = { key: stageKey(state), used: usedThisStage(state) + 1 };
    // Level 2: the catch is tested. In the answer, it turns yellow and
    // needs no slot, so nothing is thrown back.
    if (level(this) >= 2) {
      if (inAnswer(state, caught.glyph)) {
        state.discard.push(caught);
        markPresent(this, caught.glyph);
        state.lastMessage = "Fish Hook: you caught " + caught.glyph + ", and it's in the answer!";
        try { this.save(); } catch (_error) { /* next save */ }
        return { ok: true, glyph: caught.glyph, thrown: null, tested: "present" };
      }
      state.knownAbsent = uniqueSorted((state.knownAbsent || []).concat([caught.glyph]));
      shownByHook(state, "a:" + caught.glyph);
    }
    if (thrown) {
      state.hand = state.hand.filter(function keep(card) { return card.id !== thrown.id; });
      if (thrown.source === "deck") state.discard.push(thrown);
    }
    state.hand.push(caught);
    var tested = level(this) >= 2 ? " It isn't in the answer." : "";
    state.lastMessage = "Fish Hook: you caught " + caught.glyph + (thrown ? " and threw back " + thrown.glyph : "") + "." + tested;
    try { this.save(); } catch (_error) { /* next save */ }
    return { ok: true, glyph: caught.glyph, thrown: thrown ? thrown.glyph : null, tested: tested ? "absent" : null };
  };

  // Level 3: once a stage, a letter of the answer that lands in the
  // discard pile (and isn't known yet) is hooked out on its own and turns
  // yellow. Returns the letter, or null.
  proto.autoHook = function autoHook() {
    var state = this.state;
    if (level(this) < 3 || !state || inDuel(state) || state.status !== "playing" || state.pendingRoundEnd) return null;
    if (state.umtFishAuto === stageKey(state)) return null;
    var game = this;
    var bite = (state.discard || []).find(function letter(card) {
      if (!isLetter(card) || !inAnswer(state, card.glyph)) return false;
      var status = typeof game.getCardKnowledgeStatus === "function" ? game.getCardKnowledgeStatus(card.glyph) : "unused";
      return status !== "yellow" && status !== "green";
    });
    if (!bite) return null;
    state.umtFishAuto = stageKey(state);
    markPresent(this, bite.glyph);
    state.lastMessage = ((state.lastMessage || "") + " Fish Hook bit on its own: " + bite.glyph + " is in the answer.").trim();
    try { this.save(); } catch (_error) { /* next save */ }
    return bite.glyph;
  };

  // -- on screen -------------------------------------------------------------------
  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  function hookSvg() {
    var icons = window.CuddleIcons;
    return icons && typeof icons.svg === "function" ? icons.svg("🪝") : "🪝";
  }

  // The hook on the deck, while Fish Hook is ready this stage.
  function placeButton(game) {
    var row = document.querySelector("#cuddleScreen .cuddle-submit-row.has-deck");
    var existing = document.querySelector("#cuddleScreen .umt-fish-btn");
    var show = Boolean(row) && ready(game) && !row.classList.contains("is-mulligan-mode");
    if (!show) {
      if (existing) existing.remove();
      return;
    }
    if (existing && existing.parentNode === row) return;
    if (existing) existing.remove();
    row.insertAdjacentHTML("beforeend", '<button type="button" class="umt-fish-btn" data-umt-fish-open aria-label="Fish Hook: take a card back from the discard pile" title="Fish Hook: take a card back from the discard pile">' + hookSvg() + "</button>");
  }

  var view = { open: false, glyph: "", throwId: "" };

  function sheetHtml(game) {
    var full = handFull(game);
    var fish = pond(game).map(function chip(entry) {
      var status = typeof game.getCardKnowledgeStatus === "function" ? game.getCardKnowledgeStatus(entry.glyph) : "unused";
      return '<button type="button" class="umt-fish-card is-' + esc(status) + (view.glyph === entry.glyph ? " is-picked" : "") + '" data-umt-fish-pick="' + esc(entry.glyph) + '" aria-pressed="' + (view.glyph === entry.glyph) + '">'
        + esc(entry.glyph) + (entry.count > 1 ? "<small>×" + entry.count + "</small>" : "") + "</button>";
    }).join("");
    var back = full ? throwable(game).map(function chip(card) {
      return '<button type="button" class="umt-fish-card is-hand' + (view.throwId === card.id ? " is-picked" : "") + '" data-umt-fish-throw="' + esc(card.id) + '" aria-pressed="' + (view.throwId === card.id) + '">' + esc(card.glyph) + "</button>";
    }).join("") : "";
    var canGo = view.glyph && (!full || view.throwId);
    var label = !view.glyph ? "Pick a card to catch" : full && !view.throwId ? "Pick a card to throw back" : "Catch " + view.glyph;
    return '<div class="umt-fish-overlay" role="dialog" aria-modal="true" aria-labelledby="umtFishTitle">'
      + '<section class="umt-fish-sheet">'
      + '<header><span class="umt-fish-icon" aria-hidden="true">' + hookSvg() + '</span><div><h2 id="umtFishTitle">Fish Hook</h2>'
      + "<p>Take one card back from your discard pile." + (level(game) > 0 ? " Once a stage." : "")
      + (level(game) >= 2 ? " The letter you catch is tested: if it's in the answer, it turns yellow and needs no space." : "") + "</p></div>"
      + '<button type="button" class="umt-fish-close" data-umt-fish-close aria-label="Close">×</button></header>'
      + '<h3>Discard pile</h3><div class="umt-fish-pond">' + fish + "</div>"
      + (full ? '<h3>Your hand is full: throw one back</h3><div class="umt-fish-pond">' + back + "</div>" : "")
      + '<button type="button" class="cuddle-btn cuddle-btn-primary umt-fish-go" data-umt-fish-go' + (canGo ? "" : " disabled") + ">" + esc(label) + "</button>"
      + "</section></div>";
  }

  function renderSheet() {
    var game = activeGame();
    var existing = document.querySelector(".umt-fish-overlay");
    if (!view.open || !game || !ready(game)) {
      view.open = false;
      if (existing) existing.remove();
      return;
    }
    if (existing) existing.remove();
    (document.getElementById("cuddleScreen") || document.body).insertAdjacentHTML("beforeend", sheetHtml(game));
  }

  function close() {
    view = { open: false, glyph: "", throwId: "" };
    renderSheet();
  }

  document.addEventListener("click", function onClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest("[data-umt-fish-open]")) {
      event.preventDefault();
      event.stopPropagation();
      view = { open: true, glyph: "", throwId: "" };
      renderSheet();
      return;
    }
    if (!document.querySelector(".umt-fish-overlay")) return;
    var pick = target.closest("[data-umt-fish-pick]");
    var toss = target.closest("[data-umt-fish-throw]");
    if (pick || toss) {
      event.preventDefault();
      if (pick) view.glyph = pick.dataset.umtFishPick;
      if (toss) view.throwId = toss.dataset.umtFishThrow;
      renderSheet();
      return;
    }
    if (target.closest("[data-umt-fish-go]")) {
      event.preventDefault();
      var game = activeGame();
      var from = deckSpot();
      var result = game ? game.fishCard(view.glyph, view.throwId) : null;
      close();
      if (result && result.ok) {
        try { window.dispatchEvent(new Event("cuddle:campaign-update")); } catch (_error) { /* next render */ }
        playCatch(from, result.glyph, result.tested);
      }
      return;
    }
    if (target.closest("[data-umt-fish-close]") || target.classList.contains("umt-fish-overlay")) {
      event.preventDefault();
      close();
    }
  }, true);

  document.addEventListener("keydown", function onKey(event) {
    if (event.key === "Escape" && document.querySelector(".umt-fish-overlay")) close();
  });

  // -- the catch, animated ---------------------------------------------------------
  // A line drops from the top of the screen onto the deck, the water
  // splashes, the hook comes up with the card wriggling on it, and the card
  // is flung into the hand -- yellow if it's in the answer, grey if not.
  function reducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_error) {
      return false;
    }
  }

  function deckSpot() {
    var deck = document.querySelector("#cuddleScreen .cuddle-deck");
    var box = deck ? deck.getBoundingClientRect() : null;
    if (!box || !box.width) return null;
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }

  function handCard(glyph) {
    var cards = document.querySelectorAll('#cuddleScreen .cuddle-hand-panel [data-card-glyph="' + glyph + '"]');
    return cards.length ? cards[cards.length - 1] : null;
  }

  function playCatch(from, glyph, tested) {
    if (!from || reducedMotion() || !document.body || typeof document.body.animate !== "function") return;
    var layer = document.createElement("div");
    layer.className = "umt-catch";
    layer.setAttribute("aria-hidden", "true");
    var kind = tested === "present" ? "is-yellow" : tested === "absent" ? "is-grey" : "is-plain";
    layer.innerHTML = '<span class="umt-catch-line"></span>'
      + '<span class="umt-catch-ring"></span><span class="umt-catch-ring is-late"></span>'
      + '<span class="umt-catch-drop"></span><span class="umt-catch-drop is-b"></span><span class="umt-catch-drop is-c"></span>'
      + '<span class="umt-catch-card ' + kind + '">' + esc(glyph) + "</span>"
      + '<span class="umt-catch-hook">' + hookSvg() + "</span>";
    document.body.appendChild(layer);
    var x = from.x;
    var y = from.y;
    var up = Math.max(60, y * 0.38);
    var T = 1700;
    var at = function at(el) { el.style.left = x + "px"; return el; };
    var line = at(layer.querySelector(".umt-catch-line"));
    line.style.height = y + "px";
    line.animate([
      { transform: "scaleY(0)", offset: 0 },
      { transform: "scaleY(1)", offset: 0.26, easing: "ease-in" },
      { transform: "scaleY(1)", offset: 0.4 },
      { transform: "scaleY(" + ((y - up) / y).toFixed(3) + ")", offset: 0.62, easing: "ease-out" },
      { transform: "scaleY(" + ((y - up) / y).toFixed(3) + ")", offset: 0.7 },
      { transform: "scaleY(0)", opacity: 0, offset: 1 }
    ], { duration: T, easing: "ease-in-out", fill: "forwards" });
    at(layer.querySelector(".umt-catch-hook")).animate([
      { transform: "translate(-50%, -100%) translateY(0)", offset: 0 },
      { transform: "translate(-50%, -100%) translateY(" + y + "px)", offset: 0.26, easing: "ease-in" },
      { transform: "translate(-50%, -100%) translateY(" + (y + 6) + "px)", offset: 0.32 },
      { transform: "translate(-50%, -100%) translateY(" + y + "px)", offset: 0.4 },
      { transform: "translate(-50%, -100%) translateY(" + (y - up) + "px) rotate(10deg)", offset: 0.62, easing: "ease-out" },
      { transform: "translate(-50%, -100%) translateY(" + (y - up) + "px) rotate(-8deg)", offset: 0.7 },
      { transform: "translate(-50%, -100%) translateY(0)", opacity: 0, offset: 1 }
    ], { duration: T, easing: "ease-in-out", fill: "forwards" });
    // The splash where the hook goes in.
    Array.prototype.forEach.call(layer.querySelectorAll(".umt-catch-ring"), function ring(el, index) {
      at(el).style.top = y + "px";
      el.animate([
        { transform: "translate(-50%, -50%) scale(0.2)", opacity: 0 },
        { transform: "translate(-50%, -50%) scale(0.3)", opacity: 0.9, offset: 0.01 },
        { transform: "translate(-50%, -50%) scale(" + (index ? 2.2 : 1.6) + ")", opacity: 0 }
      ], { duration: 650, delay: T * 0.27 + index * 120, easing: "ease-out", fill: "both" });
    });
    Array.prototype.forEach.call(layer.querySelectorAll(".umt-catch-drop"), function drop(el, index) {
      at(el).style.top = y + "px";
      var side = (index - 1) * 16;
      el.animate([
        { transform: "translate(-50%, -50%)", opacity: 0 },
        { transform: "translate(-50%, -50%)", opacity: 1, offset: 0.05 },
        { transform: "translate(calc(-50% + " + side + "px), calc(-50% - 26px))", opacity: 1, offset: 0.45 },
        { transform: "translate(calc(-50% + " + (side * 1.6) + "px), calc(-50% + 6px))", opacity: 0 }
      ], { duration: 560, delay: T * 0.28 + index * 30, easing: "ease-out", fill: "both" });
    });
    // The card: hooked at the deck, wriggling up, then flung to the hand.
    var card = at(layer.querySelector(".umt-catch-card"));
    card.style.top = "0px";
    var lift = y - up;
    // Up on the hook: hooked at the deck, wriggling as it's reeled in.
    card.animate([
      { transform: "translate(-50%, 0) translateY(" + (y + 4) + "px) scale(0.3)", opacity: 0, offset: 0 },
      { transform: "translate(-50%, 0) translateY(" + (y + 4) + "px) scale(0.3)", opacity: 0, offset: 0.51 },
      { transform: "translate(-50%, 0) translateY(" + (y - 4) + "px) scale(1.1)", opacity: 1, offset: 0.6 },
      { transform: "translate(-50%, 0) translateY(" + (y - up * 0.5) + "px) rotate(14deg)", opacity: 1, offset: 0.74 },
      { transform: "translate(-50%, 0) translateY(" + lift + "px) rotate(-12deg)", opacity: 1, offset: 0.88 },
      { transform: "translate(-50%, 0) translateY(" + lift + "px) rotate(9deg) scale(1.08)", opacity: 1, offset: 1 }
    ], { duration: T * 0.7, easing: "linear", fill: "forwards" });
    // Then flung into the hand, which has been redrawn with the catch by now.
    setTimeout(function fling() {
      var target = handCard(glyph);
      var box = target ? target.getBoundingClientRect() : null;
      var tx = box && box.width ? box.left + box.width / 2 : x + 60;
      var ty = box && box.width ? box.top + box.height / 2 : y;
      var dx = tx - x;
      var flight = card.animate([
        { transform: "translate(-50%, 0) translateY(" + lift + "px) rotate(9deg) scale(1.08)", opacity: 1 },
        { transform: "translate(calc(-50% + " + (dx * 0.5).toFixed(1) + "px), 0) translateY(" + (Math.min(lift, ty) - 50) + "px) rotate(-170deg)", opacity: 1, offset: 0.45 },
        { transform: "translate(calc(-50% + " + dx.toFixed(1) + "px), 0) translateY(" + (ty - 22) + "px) rotate(-360deg) scale(0.9)", opacity: 1, offset: 0.9 },
        { transform: "translate(calc(-50% + " + dx.toFixed(1) + "px), 0) translateY(" + (ty - 22) + "px) rotate(-360deg) scale(0.7)", opacity: 0 }
      ], { duration: T * 0.32, easing: "ease-in-out", fill: "forwards" });
      flight.onfinish = function landed() {
        var live = handCard(glyph);
        if (live && typeof live.animate === "function") {
          live.animate([
            { transform: "scale(1)" },
            { transform: "scale(1.22) rotate(-4deg)", offset: 0.4 },
            { transform: "scale(1)" }
          ], { duration: 420, easing: "cubic-bezier(.2, 1.5, .4, 1)" });
        }
        layer.remove();
      };
    }, T * 0.7);
    setTimeout(function cleanup() { if (layer.parentNode) layer.remove(); }, T + 1200);
  }

  function tick() {
    var game = activeGame();
    if (!game || !game.state) return;
    var copilot = window.CuddleCopilot;
    if (!(copilot && typeof copilot.aiTurn === "function" && copilot.aiTurn(game))) {
      var from = deckSpot();
      var bit = game.autoHook();
      if (bit) {
        try { window.dispatchEvent(new Event("cuddle:campaign-update")); } catch (_error) { /* next render */ }
        playCatch(from, bit, "present");
      }
    }
    placeButton(game);
    if (view.open && !ready(game)) close();
  }

  function attach() {
    var host = document.getElementById("cuddleScreen");
    if (!host) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    var pending = false;
    new MutationObserver(function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function run() {
        pending = false;
        try { tick(); } catch (error) { console.warn("Cuddle Fish Hook:", error); }
      });
    }).observe(host, { childList: true, subtree: true });
    setInterval(function poll() {
      try { tick(); } catch (error) { console.warn("Cuddle Fish Hook:", error); }
    }, 5000);
  }
  attach();

  window.CuddleFishHook = Object.freeze({ ready: ready, pond: pond, addCatch: addCatch });
}());
