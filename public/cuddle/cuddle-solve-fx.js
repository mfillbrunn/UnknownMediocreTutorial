/* Cuddle: the moment a word is found.
 *
 * A solve used to cut straight to the cash-out. Now, over everything:
 *   1. the five letters flip to green one by one, left to right, each with
 *      its pop, sparks and climbing note (as any guess's greens do);
 *   2. a little win: the row bounces in a wave, confetti bursts out, and a
 *      short jingle plays;
 *   3. it fades away and the cash-out begins (cuddle-money-mode.js waits
 *      while busy() is true).
 * About 2.2 seconds (it's seen after every solve); a tap skips to the
 * end. Reduced motion shows the green row alone, briefly. Duels keep
 * their own ending.
 *
 * Losing a boss fight has its own moment before the end screen: the
 * answer comes up in red tiles, shudders, and the tiles drop one by one
 * to the floor (about 2.4 seconds; a tap skips it).
 */
(function () {
  "use strict";

  if (window.CuddleSolveFx) return;

  var Engine = window.CuddleEngine;
  var proto = Engine && Engine.CuddleGame && Engine.CuddleGame.prototype;
  if (!proto || typeof proto.submitDraft !== "function") return;

  var STEP_MS = 90;
  var TURN_AT = 120;
  // The win starts once the last tile has finished turning (560ms).
  var WIN_AT = 1060;
  var LEAVE_AT = 1900;
  var LEAVE_MS = 300;

  var layer = null;
  var timers = [];
  var busyUntil = 0;

  function reducedMotion() {
    try { return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (_error) { return false; }
  }

  function sound(name, arg) {
    if (window.CuddleAudio) window.CuddleAudio.play(name, arg);
  }

  function later(ms, fn) {
    timers.push(window.setTimeout(fn, ms));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch];
    });
  }

  function finish() {
    timers.forEach(window.clearTimeout);
    timers = [];
    var el = layer;
    layer = null;
    busyUntil = 0;
    document.documentElement.classList.remove("umt-sf-failing");
    if (!el) return;
    el.classList.add("is-leaving");
    window.setTimeout(function () { el.remove(); }, LEAVE_MS);
  }

  function confetti(host, row) {
    if (typeof row.animate !== "function") return;
    var box = row.getBoundingClientRect();
    var colours = ["#62d98a", "#3fa765", "#f6d35e", "#fffbe8", "#9ee6b4"];
    for (var i = 0; i < 34; i += 1) {
      var bit = document.createElement("span");
      bit.className = "umt-sf-bit" + (i % 4 === 0 ? " is-round" : "");
      bit.style.background = colours[i % colours.length];
      bit.style.left = (box.left + box.width / 2) + "px";
      bit.style.top = (box.top + box.height / 2) + "px";
      host.appendChild(bit);
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      var reach = 90 + Math.random() * 130;
      var dx = Math.cos(angle) * reach;
      var dy = Math.sin(angle) * reach;
      var spin = (Math.random() - 0.5) * 720;
      bit.animate([
        { transform: "translate(-50%, -50%) rotate(0deg) scale(0.6)", opacity: 1 },
        { transform: "translate(calc(-50% + " + (dx * 0.7) + "px), calc(-50% + " + (dy * 0.7) + "px)) rotate(" + (spin / 2) + "deg) scale(1)", opacity: 1, offset: 0.5 },
        { transform: "translate(calc(-50% + " + dx + "px), calc(-50% + " + (dy + 120) + "px)) rotate(" + spin + "deg) scale(0.8)", opacity: 0 }
      ], { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.15,.7,.35,1)", fill: "forwards" });
    }
  }

  function sparks(host, tile) {
    if (typeof tile.animate !== "function") return;
    var box = tile.getBoundingClientRect();
    for (var i = 0; i < 8; i += 1) {
      var spark = document.createElement("span");
      spark.className = "umt-sf-spark" + (i % 3 === 0 ? " is-light" : "");
      spark.style.left = (box.left + box.width / 2) + "px";
      spark.style.top = (box.top + box.height / 2) + "px";
      host.appendChild(spark);
      var angle = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.5;
      var from = box.width * 0.45;
      var to = from + 18 + Math.random() * 16;
      spark.animate([
        { transform: "translate(calc(-50% + " + (Math.cos(angle) * from) + "px), calc(-50% + " + (Math.sin(angle) * from) + "px)) scale(1)", opacity: 1 },
        { transform: "translate(calc(-50% + " + (Math.cos(angle) * to) + "px), calc(-50% + " + (Math.sin(angle) * to) + "px)) scale(0)", opacity: 0.2 }
      ], { duration: 520, easing: "cubic-bezier(.15,.75,.3,1)", fill: "forwards" });
    }
  }

  function play(word) {
    finish();
    var letters = String(word || "").toUpperCase().slice(0, 5).split("");
    if (letters.length !== 5) return;
    var still = reducedMotion();
    var el = document.createElement("div");
    el.className = "umt-sf" + (still ? " is-still" : "");
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Word found: " + letters.join(""));
    el.innerHTML = '<div class="umt-sf-card">'
      + '<div class="umt-sf-row">' + letters.map(function (letter, index) {
          return '<span class="umt-sf-tile" style="--i:' + index + '">' + escapeHtml(letter) + "</span>";
        }).join("") + "</div>"
      + "</div>";
    (document.getElementById("cuddleScreen") || document.body).appendChild(el);
    layer = el;
    el.addEventListener("click", finish);
    var total = still ? 800 : LEAVE_AT;
    busyUntil = Date.now() + total + LEAVE_MS;
    if (still) {
      el.classList.add("is-green");
      sound("solve");
      later(total, finish);
      return;
    }
    var row = el.querySelector(".umt-sf-row");
    var tiles = el.querySelectorAll(".umt-sf-tile");
    // 1. Left to right, each tile turns green.
    Array.prototype.forEach.call(tiles, function (tile, index) {
      later(TURN_AT + index * STEP_MS, function () { tile.classList.add("is-turning"); });
      later(TURN_AT + index * STEP_MS + 130, function () {
        sound("tileGreen", index);
        sparks(el, tile);
      });
    });
    // 2. The win: a bounce wave, confetti, a jingle.
    later(WIN_AT, function () {
      row.classList.add("is-winning");
      confetti(el, row);
      sound("solve");
    });
    // 3. On to the cash-out.
    later(LEAVE_AT, finish);
  }

  var FAIL_TURN_AT = 120;
  var FAIL_SHAKE_AT = 900;
  var FAIL_DROP_AT = 1350;
  var FAIL_LEAVE_AT = 2450;
  var failedKey = "";

  function fail(word) {
    finish();
    var letters = String(word || "").toUpperCase().slice(0, 5).split("");
    if (letters.length !== 5) return;
    var still = reducedMotion();
    var el = document.createElement("div");
    el.className = "umt-sf is-fail" + (still ? " is-still" : "");
    // The end screen waits behind the board until the tiles have landed.
    document.documentElement.classList.add("umt-sf-failing");
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "The answer was " + letters.join(""));
    el.innerHTML = '<div class="umt-sf-card">'
      + '<div class="umt-sf-row">' + letters.map(function (letter, index) {
          return '<span class="umt-sf-tile" style="--i:' + index + '">' + escapeHtml(letter) + "</span>";
        }).join("") + "</div>"
      + "</div>";
    (document.getElementById("cuddleScreen") || document.body).appendChild(el);
    layer = el;
    el.addEventListener("click", finish);
    var total = still ? 1200 : FAIL_LEAVE_AT;
    busyUntil = Date.now() + total + LEAVE_MS;
    if (still) {
      el.classList.add("is-red");
      sound("lose");
      later(total, finish);
      return;
    }
    var row = el.querySelector(".umt-sf-row");
    var tiles = el.querySelectorAll(".umt-sf-tile");
    // 1. Left to right, each tile turns red.
    Array.prototype.forEach.call(tiles, function (tile, index) {
      later(FAIL_TURN_AT + index * STEP_MS, function () { tile.classList.add("is-turning"); });
      later(FAIL_TURN_AT + index * STEP_MS + 130, function () { sound("tileGrey"); });
    });
    // 2. A shudder.
    later(FAIL_SHAKE_AT, function () {
      row.classList.add("is-shaking");
      sound("lose");
    });
    // 3. The tiles fall to the ground, one after another, each its own way.
    Array.prototype.forEach.call(tiles, function (tile, index) {
      later(FAIL_DROP_AT + index * 110, function () {
        if (typeof tile.animate !== "function") return;
        var drift = (Math.random() - 0.5) * 70;
        var spin = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 45);
        var floor = Math.max(260, window.innerHeight * 0.65);
        tile.animate([
          { transform: "translate(0, 0) rotate(0deg)", offset: 0 },
          { transform: "translate(" + (drift * 0.15) + "px, -10px) rotate(" + (spin * 0.1) + "deg)", offset: 0.12 },
          { transform: "translate(" + drift + "px, " + floor + "px) rotate(" + spin + "deg)", offset: 0.82 },
          { transform: "translate(" + (drift * 1.05) + "px, " + (floor - 14) + "px) rotate(" + (spin * 1.08) + "deg)", offset: 0.91 },
          { transform: "translate(" + (drift * 1.08) + "px, " + floor + "px) rotate(" + (spin * 1.1) + "deg)", offset: 1 }
        ], { duration: 950, easing: "cubic-bezier(.45,0,.9,.6)", fill: "forwards" });
        later(780, function () { sound("drop"); });
      });
    });
    // 4. On to the end of the run.
    later(FAIL_LEAVE_AT, finish);
  }

  // A boss fight lost on this call: the answer, once per stage.
  function lostBoss(game, before) {
    var state = game.state;
    if (!before || !before.boss || before.status === "lost" || !state || state.status !== "lost") return;
    if (String(state.runId || "").indexOf(":duel:") !== -1) return;
    var key = (state.runId || "run") + ":" + before.round + ":" + before.secret;
    if (key === failedKey) return;
    failedKey = key;
    fail(before.secret);
  }

  function snapshot(game) {
    var state = game.state;
    if (!state) return null;
    var boss = false;
    try { boss = typeof game.isBossRound === "function" && game.isBossRound(); } catch (_error) { boss = false; }
    return { boss: boss, status: state.status, secret: String(state.secret || ""), round: state.round };
  }

  ["submitDraft", "_resolvePendingRoundEnd"].forEach(function (name) {
    var original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = function withBossFailFx() {
      var before = snapshot(this);
      var result = original.apply(this, arguments);
      var game = this;
      var after = function (value) {
        try { lostBoss(game, before); } catch (error) { console.warn("Cuddle boss fail fx:", error); }
        return value;
      };
      if (result && typeof result.then === "function") return result.then(after);
      return after(result);
    };
  });

  function solvedEntry(game, before) {
    var state = game.state;
    if (!state || String(state.runId || "").indexOf(":duel:") !== -1) return null;
    var history = Array.isArray(state.history) ? state.history : [];
    if (history.length <= before) return null;
    var entry = history[history.length - 1];
    var marks = entry && Array.isArray(entry.feedback) ? entry.feedback : [];
    var solved = marks.length === 5 && marks.every(function (mark) { return mark === "green"; });
    return solved ? entry : null;
  }

  var base = proto.submitDraft;
  proto.submitDraft = function submitDraftWithSolveFx() {
    var before = this.state && Array.isArray(this.state.history) ? this.state.history.length : 0;
    var result = base.apply(this, arguments);
    var game = this;
    var after = function (value) {
      try {
        var entry = value && value.ok !== false ? solvedEntry(game, before) : null;
        if (entry) play(entry.word);
      } catch (error) {
        console.warn("Cuddle solve fx:", error);
      }
      return value;
    };
    if (result && typeof result.then === "function") return result.then(after);
    return after(result);
  };

  window.CuddleSolveFx = Object.freeze({
    play: play,
    fail: fail,
    skip: finish,
    // Whether the celebration is still on screen (the cash-out waits).
    busy: function busy() { return Boolean(layer) && Date.now() < busyUntil; }
  });
}());
