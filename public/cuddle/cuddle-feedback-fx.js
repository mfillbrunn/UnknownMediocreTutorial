/* Cuddle: a guess's feedback, tile by tile.
 *
 * After a guess, its row turns over quickly from left to right. Each tile
 * shows its colour as it turns: a grey just lands; a yellow pops a little
 * and flicks out a few yellow sparks; a green pops more, with a ring and
 * a spray of green sparks. Each tile then settles back to its size, and
 * plays its own small sound as it turns (cuddle-audio.js).
 *
 * Every render rebuilds #cuddleRoot, so this watches the DOM and times
 * the turn against the clock: a re-render mid-reveal picks it up where it
 * was (a negative delay) instead of starting over. Sparks fly on a layer
 * outside #cuddleRoot. Reduced motion keeps the sounds only.
 */
(function () {
  "use strict";

  if (window.CuddleFeedbackFx) return;

  var Engine = window.CuddleEngine;
  var proto = Engine && Engine.CuddleGame && Engine.CuddleGame.prototype;
  if (!proto || typeof proto.submitDraft !== "function") return;

  // One tile starts every STEP_MS; each turns in FLIP_MS and shows its
  // colour halfway through.
  var STEP_MS = 90;
  var FLIP_MS = 260;
  var SETTLE_MS = 460;

  var reveal = null;

  function reducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_error) {
      return false;
    }
  }

  function kindOf(mark) {
    if (mark === "green") return "green";
    if (mark === "yellow" || mark === "blue") return "yellow";
    return "grey";
  }

  function lengthOf(r) {
    return r.marks.length * STEP_MS + FLIP_MS + SETTLE_MS;
  }

  // The board row for this guess: the one with its letters, at its index
  // when that fits, else the last one (a Duel interleaves two players).
  function rowFor(r) {
    var rows = document.querySelectorAll("#cuddleRoot .cuddle-board .cuddle-board-row:not(.is-current-row):not(.is-thinking)");
    var matches = function (row) {
      var tiles = row.querySelectorAll(".cuddle-tile");
      if (tiles.length !== r.word.length) return false;
      var same = 0;
      for (var i = 0; i < tiles.length; i += 1) {
        var text = (tiles[i].firstChild && tiles[i].firstChild.nodeType === 3 ? tiles[i].firstChild.nodeValue : tiles[i].textContent).trim();
        if (text.charAt(0).toUpperCase() === String(r.word[i] || "").toUpperCase()) same += 1;
      }
      return same >= tiles.length - 1;
    };
    if (rows[r.row] && matches(rows[r.row])) return rows[r.row];
    for (var j = rows.length - 1; j >= 0; j -= 1) {
      if (matches(rows[j])) return rows[j];
    }
    return null;
  }

  // Marks the row's tiles to turn, from wherever the reveal is now.
  function apply() {
    var r = reveal;
    if (!r || r.still) return;
    var elapsed = Date.now() - r.at;
    if (elapsed > lengthOf(r)) {
      reveal = null;
      return;
    }
    var row = rowFor(r);
    if (!row) return;
    row.querySelectorAll(".cuddle-tile").forEach(function (tile, index) {
      if (tile.classList.contains("umt-rv")) return;
      tile.classList.add("umt-rv", "is-rv-" + kindOf(r.marks[index]));
      tile.style.setProperty("--rv-delay", (index * STEP_MS - elapsed) + "ms");
    });
  }

  // -- sparks ----------------------------------------------------------------------
  var layer = null;
  function sparkLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement("div");
    layer.className = "umt-rv-layer";
    layer.setAttribute("aria-hidden", "true");
    (document.getElementById("cuddleScreen") || document.body).appendChild(layer);
    return layer;
  }

  function sparks(tile, kind) {
    if (typeof tile.animate !== "function") return;
    var box = tile.getBoundingClientRect();
    if (!box.width) return;
    var host = sparkLayer();
    var cx = box.left + box.width / 2;
    var cy = box.top + box.height / 2;
    var green = kind === "green";
    if (green) {
      var ring = document.createElement("span");
      ring.className = "umt-rv-ring";
      ring.style.left = cx + "px";
      ring.style.top = cy + "px";
      ring.style.width = box.width + "px";
      ring.style.height = box.height + "px";
      // The tile's own shape (some worlds draw round tiles).
      ring.style.borderRadius = window.getComputedStyle(tile).borderRadius;
      host.appendChild(ring);
      ring.animate([
        { transform: "translate(-50%, -50%) scale(0.9)", opacity: 0.9 },
        { transform: "translate(-50%, -50%) scale(1.45)", opacity: 0 }
      ], { duration: 520, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }).onfinish = function () { ring.remove(); };
    }
    var count = green ? 10 : 6;
    for (var i = 0; i < count; i += 1) {
      var spark = document.createElement("span");
      spark.className = "umt-rv-spark is-" + kind + (i % 3 === 0 ? " is-light" : "");
      spark.style.left = cx + "px";
      spark.style.top = cy + "px";
      host.appendChild(spark);
      var angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      // From the tile's edge outward.
      var start = box.width * 0.42;
      var reach = start + (green ? 20 + Math.random() * 18 : 12 + Math.random() * 12);
      var size = green ? 0.8 + Math.random() * 0.6 : 0.6 + Math.random() * 0.5;
      spark.animate([
        { transform: "translate(calc(-50% + " + (Math.cos(angle) * start) + "px), calc(-50% + " + (Math.sin(angle) * start) + "px)) scale(" + size + ")", opacity: 1 },
        { transform: "translate(calc(-50% + " + (Math.cos(angle) * reach) + "px), calc(-50% + " + (Math.sin(angle) * reach) + "px)) scale(0)", opacity: 0.2 }
      ], { duration: green ? 560 : 440, easing: "cubic-bezier(.15,.75,.3,1)", fill: "forwards" }).onfinish = (function (el) { return function () { el.remove(); }; }(spark));
    }
  }

  // -- a tile turning ----------------------------------------------------------------
  function turned(r, index) {
    var kind = kindOf(r.marks[index]);
    if (window.CuddleAudio) {
      window.CuddleAudio.play(kind === "green" ? "tileGreen" : kind === "yellow" ? "tileYellow" : "tileGrey", index);
    }
    if (r.still || kind === "grey" || reveal !== r) return;
    var row = rowFor(r);
    var tile = row && row.querySelectorAll(".cuddle-tile")[index];
    if (tile) sparks(tile, kind);
  }

  function start(game) {
    var state = game.state;
    var history = state && Array.isArray(state.history) ? state.history : [];
    var entry = history[history.length - 1];
    if (!entry || !entry.word) return;
    var marks = Array.isArray(entry.shownFeedback) && entry.shownFeedback.length ? entry.shownFeedback : entry.feedback;
    if (!Array.isArray(marks) || !marks.length) return;
    // A solve has its own celebration (cuddle-solve-fx.js).
    var real = Array.isArray(entry.feedback) ? entry.feedback : marks;
    if (window.CuddleSolveFx && real.length === 5 && real.every(function (mark) { return mark === "green"; })
        && String(game.state.runId || "").indexOf(":duel:") === -1) return;
    var r = { row: history.length - 1, word: entry.word, marks: marks.slice(), at: Date.now(), still: reducedMotion() };
    reveal = r;
    r.marks.forEach(function (_mark, index) {
      window.setTimeout(function () { turned(r, index); }, index * STEP_MS + FLIP_MS / 2);
    });
    apply();
  }

  var base = proto.submitDraft;
  proto.submitDraft = function submitDraftWithReveal() {
    var before = this.state && Array.isArray(this.state.history) ? this.state.history.length : 0;
    var result = base.apply(this, arguments);
    var game = this;
    var after = function (value) {
      try {
        if (value && value.ok !== false && game.state && Array.isArray(game.state.history) && game.state.history.length > before) start(game);
      } catch (_error) { /* the board still shows the result */ }
      return value;
    };
    if (result && typeof result.then === "function") return result.then(after);
    return after(result);
  };

  // Mutation callbacks run before the next paint, so a fresh render never
  // flashes the finished colours first.
  function watch() {
    new MutationObserver(function () { if (reveal) apply(); }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) watch();
  else document.addEventListener("DOMContentLoaded", watch, { once: true });

  window.CuddleFeedbackFx = Object.freeze({ STEP_MS: STEP_MS, FLIP_MS: FLIP_MS });
}());
