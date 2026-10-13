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

  function play(item, label, delay) {
    whenSettled(item).then(function drop() { playNow(item, label, delay); });
  }

  function playNow(item, label, delay) {
    var target = targetFor(item);
    if (!target || !document.body) return;
    var box = target.getBoundingClientRect();
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
        card.animate([
          { boxShadow: "0 0 0 0 " + COLOURS[item.kind] },
          { boxShadow: "0 0 0 6px " + COLOURS[item.kind] + "aa", transform: "scale(1.08)" },
          { boxShadow: "0 0 0 0 transparent", transform: "scale(1)" }
        ], { duration: 520, easing: "ease-out" });
      }
    }, delay + 800);
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
    if (!fresh.length || reducedMotion()) return;
    // A placed letter also lands in "in the word": show it once, as green.
    var greens = new Set(fresh.filter(function g(item) { return item.kind === "green"; }).map(function l(item) { return item.letter; }));
    fresh = fresh.filter(function dedupe(item) { return item.kind !== "yellow" || !greens.has(item.letter); });
    // Vowels ruled out by a free test are hints too; keep the burst short.
    fresh.slice(0, 4).forEach(function each(item, index) {
      play(item, sourceOf(state, item), index * 260);
    });
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
