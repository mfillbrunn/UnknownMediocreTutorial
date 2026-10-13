/* Cuddle: a little animation for every new hint.
 *
 * Hints arrive from many places (Yellow Guesser Hint, Full Circle, idea
 * tiles, Last Light, the Cuddle Meter, Oracle squares, Process of
 * Elimination, quest rewards, world traits...). Without a cue the player
 * just finds a letter coloured in and wonders why. So after every render
 * this compares what the stage knows -- letters placed (green), letters in
 * the answer (yellow), letters ruled out (grey) -- with what the guesses'
 * own colours explain. Anything left over is a hint; each new one drops in
 * from the top as a small tile, lands on its letter in the hand, and a
 * label says where it came from.
 *
 * Shown hints are remembered on the stage (state.umtHintFx) so a reload
 * doesn't replay them.
 */
(function () {
  "use strict";

  if (window.CuddleHintFx) return;

  var COLOURS = { green: "#3fbf6f", yellow: "#f6c956", grey: "#787c7e" };
  var VOWELS = "AEIOU";

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function reducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_error) {
      return false;
    }
  }

  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  function shownOf(entry) {
    return Array.isArray(entry && entry.shownFeedback) ? entry.shownFeedback : (entry && entry.feedback) || [];
  }

  // Everything the stage knows, as items: "g:2:R", "p:R", "a:T".
  function knowledge(state) {
    var items = [];
    (state.revealedPositions || []).forEach(function green(letter, index) {
      if (letter) items.push({ id: "g:" + index + ":" + letter, kind: "green", letter: letter, index: index });
    });
    var placed = new Set((state.revealedPositions || []).filter(Boolean));
    (state.knownPresent || []).forEach(function yellow(letter) {
      if (!placed.has(letter)) items.push({ id: "p:" + letter, kind: "yellow", letter: letter });
    });
    (state.knownAbsent || []).forEach(function grey(letter) {
      items.push({ id: "a:" + letter, kind: "grey", letter: letter });
    });
    return items;
  }

  // Did one of the guesses' own colours show this already?
  function explained(item, history) {
    return history.some(function byGuess(entry) {
      var word = String(entry && entry.word || "").toUpperCase();
      var shown = shownOf(entry);
      if (item.kind === "green") return shown[item.index] === "green" && word[item.index] === item.letter;
      for (var i = 0; i < word.length; i += 1) {
        if (word[i] !== item.letter) continue;
        if (item.kind === "yellow" && (shown[i] === "green" || shown[i] === "yellow")) return true;
        if (item.kind === "grey" && shown[i] === "grey") return true;
      }
      return false;
    });
  }

  function recordFor(state) {
    var key = stageKey(state);
    if (!state.umtHintFx || state.umtHintFx.key !== key) state.umtHintFx = { key: key, seen: [], sources: {} };
    if (!state.umtHintFx.sources || typeof state.umtHintFx.sources !== "object") state.umtHintFx.sources = {};
    return state.umtHintFx;
  }

  // A hint giver names itself for the label (Yellow Guesser Hint, Full
  // Circle, Idea card...).
  function note(game, letter, label) {
    var state = game && game.state;
    if (!state || !letter || !label) return;
    recordFor(state).sources[String(letter).toUpperCase()] = String(label);
  }

  // Where the hint came from: its own note, else the stage's message
  // ("Full Circle: Position 1 is G..." -> "Full Circle").
  function sourceOf(state, item) {
    var named = state.umtHintFx && state.umtHintFx.sources && state.umtHintFx.sources[item.letter];
    if (named) return named;
    var text = String(state.lastMessage || "");
    var sentences = text.split(/[.!]\s+/);
    for (var i = sentences.length - 1; i >= 0; i -= 1) {
      var sentence = sentences[i];
      if (!new RegExp("\\b" + item.letter + "\\b").test(sentence)) continue;
      var match = sentence.match(/^([A-Z][A-Za-z' ]{2,28}?)(?: tile)?:\s/);
      if (match) return match[1].trim();
      if (/whisper/i.test(sentence)) return "Whispers";
    }
    return item.kind === "grey" ? "Ruled out" : "New hint";
  }

  function targetFor(item) {
    var screen = document.getElementById("cuddleScreen");
    if (!screen) return null;
    var card = screen.querySelector('.cuddle-hand-panel .cuddle-card[data-card-glyph="' + item.letter + '"]');
    if (card) return card;
    return screen.querySelector(".cuddle-hand-panel") || null;
  }

  function layer() {
    var el = document.querySelector(".umt-hint-fx-layer");
    if (!el) {
      el = document.createElement("div");
      el.className = "umt-hint-fx-layer";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    return el;
  }

  // -- holding the hand still while a hint falls ---------------------------
  // A hint changes its letter's card at once: a letter in the word turns
  // yellow or green and is sorted to the left, a ruled-out one turns red
  // and goes to the right. So the hand's last layout is remembered (where
  // each card sat and how it looked), and when a hint arrives every card
  // that moved is shown back in its old place, the hinted card in its old
  // colour; the hint falls onto it there, and only then does the card take
  // its new colour and the hand slide into its new order.
  var lastLayout = {};
  var holding = 0;
  var LAND_MS = 800;
  var SLIDE_MS = 380;

  function handCards() {
    var screen = document.getElementById("cuddleScreen");
    return screen ? Array.prototype.slice.call(screen.querySelectorAll(".cuddle-hand-panel .cuddle-card[data-card-glyph]")) : [];
  }

  // A card's centre where the layout puts it, without any animation's
  // transform (a card can be mid-flight from the deck pile).
  function layoutOf(card) {
    var box = card.getBoundingClientRect();
    var dx = 0;
    var dy = 0;
    try {
      var transform = getComputedStyle(card).transform;
      if (transform && transform !== "none" && typeof DOMMatrixReadOnly === "function") {
        var matrix = new DOMMatrixReadOnly(transform);
        dx = matrix.e;
        dy = matrix.f;
      }
    } catch (_error) {
      dx = 0;
      dy = 0;
    }
    return { x: box.left + box.width / 2 - dx, y: box.top + box.height / 2 - dy, w: box.width, h: box.height, cls: card.className };
  }

  function snapshot() {
    var layout = {};
    handCards().forEach(function remember(card) { layout[card.getAttribute("data-card-glyph")] = layoutOf(card); });
    lastLayout = layout;
  }

  // Shows every card that moved back where it was (and the hinted cards
  // in their old look) for `holdMs`, then lets them slide into place.
  function holdHand(letters, before, holdMs) {
    var held = false;
    handCards().forEach(function hold(card) {
      var glyph = card.getAttribute("data-card-glyph");
      var old = before[glyph];
      if (!old || typeof card.animate !== "function") return;
      var now = layoutOf(card);
      var dx = old.x - now.x;
      var dy = old.y - now.y;
      var hinted = letters.indexOf(glyph) !== -1 && old.cls && old.cls !== card.className;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !hinted) return;
      held = true;
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
        // Any flight from the deck pile gives way to the hold.
        card.getAnimations().forEach(function stop(animation) { try { animation.cancel(); } catch (_error) { /* gone */ } });
        var total = holdMs + SLIDE_MS;
        card.animate([
          { transform: "translate(" + dx + "px, " + dy + "px)" },
          { transform: "translate(" + dx + "px, " + dy + "px)", offset: holdMs / total },
          { transform: "translate(0, 0)" }
        ], { duration: total, easing: "ease-in-out" });
      }
      if (hinted) {
        // Other layers decorate the card after this render (a hint colour
        // class), so the old look is put back on every change until the
        // hint lands, and the latest look is kept for then.
        var next = card.className;
        var restoring = false;
        card.className = old.cls;
        var watcher = typeof MutationObserver === "function" ? new MutationObserver(function keepOld() {
          if (restoring || card.className === old.cls) return;
          next = card.className;
          restoring = true;
          card.className = old.cls;
          restoring = false;
        }) : null;
        if (watcher) watcher.observe(card, { attributes: true, attributeFilter: ["class"] });
        setTimeout(function reveal() {
          if (watcher) watcher.disconnect();
          if (card.isConnected) card.className = next;
        }, holdMs);
      }
    });
    if (held) {
      holding += 1;
      setTimeout(function release() { holding = Math.max(0, holding - 1); snapshot(); }, holdMs + SLIDE_MS + 40);
    }
    return held;
  }

  // A card that was just dealt (or re-dealt as a hint letter) flies in
  // from the deck pile (cuddle-deck-fx.js); measured mid-flight it sits by
  // the pile at the far left. So wait a frame for that flight to start,
  // then for it to land (at most 1.2s), and measure the card where it is.
  function whenSettled(item) {
    return new Promise(function wait(resolve) {
      requestAnimationFrame(function nextFrame() {
        var card = targetFor(item);
        var running = card && typeof card.getAnimations === "function"
          ? card.getAnimations().filter(function moving(a) { return a.playState === "running" || a.playState === "pending"; })
          : [];
        if (!running.length) { resolve(); return; }
        Promise.race([
          Promise.all(running.map(function done(a) { return a.finished.catch(function ignore() {}); })),
          new Promise(function cap(done) { setTimeout(done, 1200); })
        ]).then(function settled() { resolve(); });
      });
    });
  }

  // `spot` is where the card sat before the hint (holdHand keeps it
  // there); without one, wait for the card to settle and measure it.
  function play(item, label, delay, spot) {
    if (spot) { playNow(item, label, delay, spot); return; }
    whenSettled(item).then(function drop() { playNow(item, label, delay, null); });
  }

  function playNow(item, label, delay, spot) {
    var target = targetFor(item);
    if ((!target && !spot) || !document.body) return;
    var box = spot
      ? { left: spot.x - spot.w / 2, top: spot.y - spot.h / 2, width: spot.w, height: spot.h }
      : target.getBoundingClientRect();
    var host = layer();
    var tile = document.createElement("span");
    tile.className = "umt-hint-fx-tile is-" + item.kind;
    tile.textContent = item.letter;
    tile.style.background = COLOURS[item.kind];
    var size = 40;
    var endX = box.left + box.width / 2 - size / 2;
    var endY = box.top + box.height / 2 - size / 2;
    tile.style.left = endX + "px";
    tile.style.top = endY + "px";
    var tag = document.createElement("span");
    tag.className = "umt-hint-fx-tag is-" + item.kind;
    tag.textContent = (item.kind === "green" ? "Placed" : item.kind === "yellow" ? "In the word" : "Not in it") + " · " + label;
    tag.style.left = (box.left + box.width / 2) + "px";
    tag.style.top = Math.max(8, box.top - 30) + "px";
    host.appendChild(tile);
    host.appendChild(tag);
    // Keep the label on screen when the letter sits at an edge.
    var half = tag.offsetWidth / 2;
    var centre = Math.min(window.innerWidth - half - 6, Math.max(half + 6, box.left + box.width / 2));
    tag.style.left = centre + "px";
    var drop = endY + size + 40;
    tile.animate([
      { transform: "translateY(" + (-drop) + "px) rotate(-18deg) scale(0.8)", opacity: 0 },
      { transform: "translateY(" + (-drop * 0.35) + "px) rotate(8deg) scale(1)", opacity: 1, offset: 0.45 },
      { transform: "translateY(6px) rotate(0deg) scale(1.08)", opacity: 1, offset: 0.72 },
      { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.86 },
      { transform: "translateY(0) scale(0.6)", opacity: 0 }
    ], { duration: 1100, delay: delay, easing: "ease-out", fill: "both" });
    tag.animate([
      { transform: "translate(-50%, 6px)", opacity: 0 },
      { transform: "translate(-50%, 0)", opacity: 1, offset: 0.15 },
      { transform: "translate(-50%, 0)", opacity: 1, offset: 0.8 },
      { transform: "translate(-50%, -6px)", opacity: 0 }
    ], { duration: 1500, delay: delay + 420, easing: "ease-out", fill: "both" });
    setTimeout(function landed() {
      var card = targetFor(item);
      if (card && typeof card.animate === "function") {
        // A glow only: the card's transform belongs to the hold.
        card.animate([
          { boxShadow: "0 0 0 0 " + COLOURS[item.kind] },
          { boxShadow: "0 0 0 6px " + COLOURS[item.kind] + "aa" },
          { boxShadow: "0 0 0 0 transparent" }
        ], { duration: 520, easing: "ease-out", composite: "add" });
      }
    }, delay + LAND_MS);
    setTimeout(function cleanUp() { tile.remove(); tag.remove(); }, delay + 2100);
  }

  function check() {
    var game = activeGame();
    var state = game && game.state;
    if (!state || !state.secret || !Array.isArray(state.history)) return;
    if (state.status !== "playing") return;
    if (String(state.runId || "").indexOf(":duel:") !== -1) return;
    if (!document.querySelector("#cuddleScreen .cuddle-hand-panel")) return;
    var record = recordFor(state);
    var fresh = knowledge(state).filter(function isNew(item) {
      return record.seen.indexOf(item.id) === -1 && !explained(item, state.history);
    });
    // Everything known is now "seen", hint or not, so nothing replays.
    knowledge(state).forEach(function mark(item) {
      if (record.seen.indexOf(item.id) === -1) record.seen.push(item.id);
    });
    var before = lastLayout;
    if (!fresh.length || reducedMotion()) {
      if (!holding) snapshot();
      return;
    }
    // A placed letter also lands in "in the word": show it once, as green.
    var greens = new Set(fresh.filter(function g(item) { return item.kind === "green"; }).map(function l(item) { return item.letter; }));
    fresh = fresh.filter(function dedupe(item) { return item.kind !== "yellow" || !greens.has(item.letter); });
    // Vowels ruled out by a free test are hints too; keep the burst short.
    var shown = fresh.slice(0, 4);
    var letters = shown.map(function l(item) { return item.letter; });
    var held = holdHand(letters, before, (shown.length - 1) * 260 + LAND_MS);
    shown.forEach(function each(item, index) {
      play(item, sourceOf(state, item), index * 260, held ? before[item.letter] : null);
    });
    if (!held) snapshot();
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function run() {
      pending = false;
      try { check(); } catch (error) { console.warn("Cuddle hint fx:", error); }
    });
  }

  function attach() {
    var host = document.getElementById("cuddleScreen");
    if (!host) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    new MutationObserver(schedule).observe(host, { childList: true, subtree: true });
    schedule();
  }
  attach();

  window.CuddleHintFx = Object.freeze({ check: check, note: note, knowledge: knowledge, explained: explained, VOWELS: VOWELS });
}());
