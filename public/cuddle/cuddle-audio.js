/* Cuddle: music and sound effects.
 *
 * Music: one looping track (audio/cuddle-theme.mp3), only once a run is on
 * screen (the road, a stage, the shop...), not on Cuddle's start screen.
 * It fades in and out and pauses off Cuddle or in a hidden tab.
 *
 * Sound effects: small sounds made on the spot with Web Audio (no files),
 * hooked to what the player does and what the game does back: a soft
 * click for every button, picking, removing and dragging cards, a guess's
 * feedback tile by tile, hints, mulligans and shuffles, the coin going in,
 * a pack's rip and each badge out of it, a bing for each badge landing in
 * the collection, quest rewards, the cash-out's rows and its collect,
 * entering a stage (a swoosh) / Trial / Duel / shop, a boss's entrance,
 * winning and losing, buying and selling, the Fish Hook, quests, special
 * squares, special cards tapped (dead, lucky, idea, Joker) and waves.
 *
 * Browsers only allow sound after a tap, so nothing plays before the first
 * one. The speaker button in Cuddle's top bars opens Music and Sound
 * effects switches; both are remembered.
 */
(function () {
  "use strict";

  if (window.CuddleAudio) return;

  var Engine = window.CuddleEngine;
  var proto = Engine && Engine.CuddleGame && Engine.CuddleGame.prototype;

  // -- settings --------------------------------------------------------------------
  var KEYS = { music: "umt-cuddle-music", sfx: "umt-cuddle-sfx" };
  function readSetting(name) {
    try { return localStorage.getItem(KEYS[name]) !== "off"; } catch (_error) { return true; }
  }
  function writeSetting(name, on) {
    try { localStorage.setItem(KEYS[name], on ? "on" : "off"); } catch (_error) { /* not remembered */ }
  }
  var settings = { music: readSetting("music"), sfx: readSetting("sfx") };
  var unlocked = false;

  function screen() { return document.getElementById("cuddleScreen"); }
  function inCuddle() {
    var el = screen();
    return Boolean(el && el.classList.contains("active")) && !document.hidden;
  }
  // A run is on screen: anything in Cuddle but its start screen.
  function inRun() {
    var el = screen();
    return inCuddle() && Boolean(el.querySelector(".cuddle-shell, .cuddle-branch-shell, .umt-shop-page"))
      && !el.querySelector(".cuddle-landing");
  }

  // -- music -----------------------------------------------------------------------
  var MUSIC_SRC = "cuddle/audio/cuddle-theme.mp3";
  var MUSIC_VOLUME = 0.18;
  // It eases in slowly and steps out quickly.
  var FADE_IN_MS = 4000;
  var FADE_OUT_MS = 700;
  var music = null;
  var fade = 0;
  var fadeTarget = -1;

  // Fades the music to a volume. A repeat call for the same volume keeps the
  // fade already running, since the page re-syncs on every DOM change.
  function ramp(to, done, ms) {
    if (!music || to === fadeTarget) return;
    fadeTarget = to;
    window.clearInterval(fade);
    var from = music.volume;
    var started = Date.now();
    fade = window.setInterval(function step() {
      var t = Math.min(1, (Date.now() - started) / ms);
      music.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t >= 1) {
        window.clearInterval(fade);
        if (done) done();
      }
    }, 50);
  }

  function syncMusic() {
    var want = settings.music && unlocked && inRun();
    if (want) {
      if (!music) {
        music = new Audio(MUSIC_SRC);
        music.loop = true;
        music.preload = "none";
        music.volume = 0;
      }
      if (music.paused) {
        var playing = music.play();
        if (playing && typeof playing.catch === "function") playing.catch(function blocked() { unlocked = false; fadeTarget = -1; });
      }
      ramp(MUSIC_VOLUME, null, FADE_IN_MS);
    } else if (music && !music.paused) {
      ramp(0, function stop() { if (music && !(settings.music && unlocked && inRun())) music.pause(); }, FADE_OUT_MS);
    }
  }

  // -- sound effects ---------------------------------------------------------------
  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var SFX_VOLUME = 0.5;

  function audioContext() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = SFX_VOLUME;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // A tone: frequency (gliding to f2), wave type, length, volume, delay.
  function tone(o) {
    var ac = ctx;
    var start = ac.currentTime + (o.delay || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f, start);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, start + o.dur);
    var peak = o.vol == null ? 0.3 : o.vol;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + (o.attack || 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
    var out = gain;
    if (o.filter) {
      var filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = o.filter;
      gain.connect(filter);
      out = filter;
    }
    osc.connect(gain);
    out.connect(master);
    osc.start(start);
    osc.stop(start + o.dur + 0.05);
  }

  // A burst of filtered noise: a swish, a thud, a splash.
  function noise(o) {
    var ac = ctx;
    var start = ac.currentTime + (o.delay || 0);
    var src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = ac.createBiquadFilter();
    filter.type = o.kind || "bandpass";
    filter.frequency.setValueAtTime(o.f || 1200, start);
    if (o.f2) filter.frequency.exponentialRampToValueAtTime(o.f2, start + o.dur);
    filter.Q.value = o.q || 1;
    var gain = ac.createGain();
    var peak = o.vol == null ? 0.25 : o.vol;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + (o.attack || 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(start);
    src.stop(start + o.dur + 0.05);
  }

  function notes(list, step, o) {
    list.forEach(function (f, i) { tone(Object.assign({ f: f, dur: 0.18, type: "triangle", vol: 0.22 }, o || {}, { delay: ((o && o.delay) || 0) + i * step })); });
  }

  var C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568;

  var SOUNDS = {
    // Tiles: a soft, short tip-tap, a little lower going back.
    pick: function () { tone({ f: 430, f2: 380, dur: 0.055, type: "sine", vol: 0.16, attack: 0.002 }); noise({ f: 2600, q: 1.4, dur: 0.022, vol: 0.05, attack: 0.001 }); },
    remove: function () { tone({ f: 350, f2: 300, dur: 0.055, type: "sine", vol: 0.14, attack: 0.002 }); noise({ f: 2000, q: 1.4, dur: 0.022, vol: 0.04, attack: 0.001 }); },
    // Any button.
    tap: function () { noise({ f: 1500, q: 1.2, dur: 0.028, vol: 0.06, attack: 0.001 }); tone({ f: 280, f2: 240, dur: 0.04, type: "sine", vol: 0.07, attack: 0.002 }); },
    drag: function () { noise({ f: 2400, q: 2, dur: 0.09, vol: 0.08 }); },
    drop: function () { tone({ f: 380, f2: 520, dur: 0.07, type: "triangle", vol: 0.2 }); noise({ f: 3000, q: 3, dur: 0.03, vol: 0.06 }); },
    // A guess's tiles as they turn (cuddle-feedback-fx.js), by column:
    // greens climb a scale, so a row of them rings out.
    tileGrey: function () { tone({ f: 230, f2: 190, dur: 0.07, type: "sine", vol: 0.1, attack: 0.003 }); },
    tileYellow: function (i) { tone({ f: 740 * Math.pow(1.03, i), dur: 0.13, type: "triangle", vol: 0.13, attack: 0.003 }); noise({ f: 5200, q: 2, dur: 0.03, vol: 0.03 }); },
    tileGreen: function (i) { var f = [G5, A5, C6, 1174.7, E6][i % 5]; tone({ f: f, dur: 0.22, type: "triangle", vol: 0.15, attack: 0.003 }); tone({ f: f * 2, dur: 0.14, type: "sine", vol: 0.04, delay: 0.01 }); noise({ f: 6000, q: 2, dur: 0.04, vol: 0.03 }); },
    invalid: function () { tone({ f: 150, dur: 0.16, type: "square", vol: 0.08, filter: 900 }); tone({ f: 120, dur: 0.16, type: "square", vol: 0.08, filter: 900, delay: 0.08 }); },
    hint: function () { notes([A5, C6, E6], 0.07, { type: "sine", vol: 0.16, dur: 0.22 }); },
    shuffle: function () { [0, 0.06, 0.12].forEach(function (d) { noise({ f: 1800, q: 1.5, dur: 0.06, vol: 0.1, delay: d }); }); },
    mulligan: function () { SOUNDS.shuffle(); noise({ f: 600, f2: 3200, q: 1, dur: 0.28, vol: 0.1, delay: 0.15 }); tone({ f: 300, f2: 450, dur: 0.12, type: "triangle", vol: 0.12, delay: 0.32 }); },
    // A badge landing in the collection: a small bell, a step higher for
    // each one in a row.
    bing: function (i) { var f = E6 * Math.pow(1.122, i % 4); tone({ f: f, dur: 0.7, type: "sine", vol: 0.15, attack: 0.004 }); tone({ f: f * 2.76, dur: 0.22, type: "sine", vol: 0.03, attack: 0.002 }); tone({ f: f / 2, dur: 0.3, type: "triangle", vol: 0.04 }); },
    // A quest reward taken: two bells.
    reward: function () { tone({ f: C6, dur: 0.35, type: "sine", vol: 0.14, attack: 0.003 }); tone({ f: G6, dur: 0.8, type: "sine", vol: 0.15, attack: 0.003, delay: 0.09 }); tone({ f: G6 * 2.76, dur: 0.2, type: "sine", vol: 0.03, delay: 0.09 }); },
    // Opening a pack (cuddle-packs.js): rustling that builds as it shakes,
    // a swell, then the rip.
    pack: function () {
      [0, 0.1, 0.19, 0.28, 0.36, 0.44, 0.51, 0.57].forEach(function (d, i) { noise({ f: 1300 + i * 160, q: 1.2, dur: 0.06, vol: 0.04 + i * 0.012, delay: d }); });
      noise({ f: 500, f2: 2200, q: 0.7, dur: 0.34, vol: 0.08, delay: 0.62, attack: 0.3 });
      noise({ f: 3200, f2: 900, q: 0.9, dur: 0.26, vol: 0.22, delay: 0.96, attack: 0.005 });
      notes([E6, G6, C6 * 2], 0.05, { type: "sine", vol: 0.07, dur: 0.3, delay: 1.0 });
    },
    // One badge flying out of the pack, brighter for a rarer one.
    packCard: function (tier) {
      var f = { common: A5, rare: C6, epic: E6, legendary: G6 }[tier] || A5;
      tone({ f: f * 0.75, f2: f, dur: 0.08, type: "triangle", vol: 0.1 });
      tone({ f: f, dur: 0.3, type: "sine", vol: 0.12, delay: 0.05 });
      if (tier === "epic" || tier === "legendary") notes([f * 1.5, f * 2], 0.05, { type: "sine", vol: 0.05, dur: 0.25, delay: 0.1 });
    },
    // The coin dropping into the cabinet (cuddle-coin-start.js).
    coin: function () { noise({ f: 6000, q: 3, dur: 0.03, vol: 0.05 }); tone({ f: 1976, dur: 0.5, type: "sine", vol: 0.14, attack: 0.002 }); tone({ f: 2637, dur: 0.45, type: "sine", vol: 0.1, attack: 0.002, delay: 0.07 }); tone({ f: 5274, dur: 0.15, type: "sine", vol: 0.03, delay: 0.07 }); },
    cashRow: function () { tone({ f: 1320 + Math.random() * 120, dur: 0.07, type: "sine", vol: 0.12 }); },
    collect: function () { [0, 0.05, 0.1, 0.15, 0.2].forEach(function (d, i) { tone({ f: 1400 + i * 120, dur: 0.09, type: "sine", vol: 0.12, delay: d }); }); notes([C6, E6], 0.08, { delay: 0.25, vol: 0.16 }); },
    // Into a stage: a swoosh.
    stage: function () { noise({ f: 350, f2: 2600, q: 0.8, dur: 0.32, vol: 0.14, attack: 0.12 }); noise({ f: 2600, f2: 900, q: 0.8, dur: 0.2, vol: 0.05, delay: 0.26 }); },
    trial: function () { notes([A5 / 2, E5, A5], 0.14, { type: "sine", vol: 0.14, dur: 0.6 }); },
    duel: function () { tone({ f: 330, dur: 0.18, type: "sawtooth", vol: 0.06, filter: 1600 }); tone({ f: 349, dur: 0.18, type: "sawtooth", vol: 0.06, filter: 1600, delay: 0.16 }); tone({ f: 494, dur: 0.4, type: "sawtooth", vol: 0.07, filter: 1800, delay: 0.32 }); },
    boss: function () { noise({ kind: "lowpass", f: 200, dur: 0.6, vol: 0.35 }); tone({ f: 110, f2: 82, dur: 1.2, type: "sawtooth", vol: 0.12, filter: 500 }); tone({ f: 116.5, f2: 87, dur: 1.2, type: "sawtooth", vol: 0.1, filter: 500, delay: 0.05 }); },
    shop: function () { tone({ f: 1760, dur: 0.35, type: "sine", vol: 0.12 }); tone({ f: 2217, dur: 0.45, type: "sine", vol: 0.1, delay: 0.12 }); },
    buy: function () { tone({ f: 1568, dur: 0.08, type: "square", vol: 0.05, filter: 3000 }); tone({ f: 2093, dur: 0.25, type: "sine", vol: 0.14, delay: 0.07 }); },
    sell: function () { tone({ f: 2093, dur: 0.08, type: "sine", vol: 0.12 }); tone({ f: 1568, dur: 0.2, type: "sine", vol: 0.12, delay: 0.08 }); },
    fish: function () { noise({ f: 700, f2: 300, q: 0.7, dur: 0.3, vol: 0.18 }); [0.25, 0.31, 0.37].forEach(function (d) { tone({ f: 900, dur: 0.03, type: "square", vol: 0.04, filter: 2500, delay: d }); }); },
    quest: function () { notes([E5, G5, C6, E6], 0.07, { type: "triangle", vol: 0.18 }); },
    square: function () { tone({ f: 1046, f2: 2093, dur: 0.16, type: "sine", vol: 0.14 }); noise({ f: 5000, q: 2, dur: 0.08, vol: 0.05, delay: 0.05 }); },
    dead: function () { tone({ f: 140, f2: 90, dur: 0.22, type: "sine", vol: 0.25 }); noise({ kind: "lowpass", f: 400, dur: 0.12, vol: 0.12 }); },
    lucky: function () { notes([E6, G6, E6 * 1.5], 0.05, { type: "sine", vol: 0.1, dur: 0.15 }); },
    idea: function () { tone({ f: 1760, dur: 0.5, type: "sine", vol: 0.14 }); tone({ f: 2637, dur: 0.4, type: "sine", vol: 0.06, delay: 0.02 }); },
    joker: function () { [0, 1, 2, 3, 4].forEach(function (i) { tone({ f: 700 * Math.pow(1.19, i), dur: 0.1, type: "triangle", vol: 0.1, delay: i * 0.04 }); }); },
    wave: function () { noise({ f: 300, f2: 1400, q: 0.6, dur: 0.9, vol: 0.2, attack: 0.25 }); noise({ f: 1400, f2: 400, q: 0.6, dur: 0.8, vol: 0.12, delay: 0.5, attack: 0.1 }); },
    win: function () { notes([C5, E5, G5, C6], 0.12, { vol: 0.2, dur: 0.25 }); notes([E6, G6], 0.0, { delay: 0.5, vol: 0.14, dur: 0.7, type: "sine" }); tone({ f: C6, dur: 0.8, type: "triangle", vol: 0.16, delay: 0.5 }); },
    lose: function () { notes([G5, E5, D5, C5 / 1.06], 0.2, { type: "triangle", vol: 0.16, dur: 0.35 }); },
    refresh: function () { noise({ f: 1200, f2: 3000, q: 1, dur: 0.18, vol: 0.1 }); },
    skip: function () { tone({ f: 660, f2: 520, dur: 0.1, type: "sine", vol: 0.12 }); },
    toast: function () { notes([G5, C6], 0.08, { type: "sine", vol: 0.12, dur: 0.25 }); }
  };

  var lastPlayed = {};
  function play(name, arg) {
    if (!settings.sfx || !unlocked || !SOUNDS[name] || !inCuddle()) return;
    var now = Date.now();
    if (lastPlayed[name] && now - lastPlayed[name] < 45) return;
    lastPlayed[name] = now;
    // A test can list what played (window.__umtSoundLog = []).
    if (Array.isArray(window.__umtSoundLog)) window.__umtSoundLog.push(name);
    var ac = audioContext();
    if (!ac) return;
    if (ac.state === "suspended" && typeof ac.resume === "function") ac.resume();
    try { SOUNDS[name](arg || 0); } catch (_error) { /* a sound that can't play is skipped */ }
  }

  // -- hooks into the game -------------------------------------------------------
  function filled(state) { return state && Array.isArray(state.draft) ? state.draft.filter(Boolean).length : 0; }

  function wrap(name, after) {
    if (!proto || typeof proto[name] !== "function") return;
    var base = proto[name];
    proto[name] = function soundWrapped() {
      var before = { draft: filled(this.state), history: this.state && Array.isArray(this.state.history) ? this.state.history.length : 0, status: this.state && this.state.status };
      var result = base.apply(this, arguments);
      try { after.call(this, result, before, arguments); } catch (_error) { /* never block the game */ }
      return result;
    };
  }

  wrap("toggleDraft", function (result, before) {
    if (!result || result.ok === false) { if (result && result.error) play("invalid"); return; }
    play(filled(this.state) < before.draft ? "remove" : "pick");
  });
  wrap("removeDraftAt", function (result) { if (result && result.ok !== false) play("remove"); });
  wrap("backspaceDraft", function (result) { if (!result || result.ok !== false) play("remove"); });
  wrap("insertDraftCardAt", function (result) { if (result && result.ok !== false) play("drop"); });
  wrap("moveDraftCard", function (result) { if (result && result.ok !== false) play("drop"); });

  // A guess: its tiles one by one, then a finished quest or a paid square.
  wrap("submitDraft", function (result, before) {
    var state = this.state;
    if (!result || result.ok === false) { play("invalid"); return; }
    var history = state && Array.isArray(state.history) ? state.history : [];
    if (history.length <= before.history) return;
    var entry = history[history.length - 1] || {};
    var feedback = Array.isArray(entry.shownFeedback) && entry.shownFeedback.length ? entry.shownFeedback : entry.feedback;
    // The tiles' own sounds play as they turn (cuddle-feedback-fx.js);
    // without it, one after another from here.
    if (!window.CuddleFeedbackFx) {
      (feedback || []).forEach(function (mark, index) {
        window.setTimeout(function () {
          play(mark === "green" ? "tileGreen" : mark === "yellow" || mark === "blue" ? "tileYellow" : "tileGrey", index);
        }, index * 90);
      });
    }
    var row = history.length - 1;
    var paid = (state.cuddleMoneyTiles || []).some(function (tile) { return tile && tile.row === row && tile.paid && tile.payout > 0; });
    if (paid) window.setTimeout(function () { play("square"); }, 760);
    if (entry.questComplete) window.setTimeout(function () { play("quest"); }, 860);
  });

  wrap("mulligan", function (result) { if (result && result.ok !== false) play("mulligan"); });
  // A badge taken rings once it lands in the collection (the badge board's
  // reveal, below), not here.
  wrap("chooseQuestReward", function (result) { if (!result || result.ok !== false) play("reward"); });
  // Buying and selling in the shop. The shop's buy method is locked against
  // wrapping (cuddle-shop-lockin.js), so this listens on window, ahead of the
  // shop's own document-level handler, and reads the money afterwards.
  window.addEventListener("click", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    var button = target && target.closest('[data-cuddle-campaign-action="buy-shop-item"][data-shop-item-id]');
    if (!button || button.disabled) return;
    var game = null;
    try { game = window.CuddleBranchMap && window.CuddleBranchMap.getActiveGame(); } catch (_error) { /* no game */ }
    if (!game || !game.state) return;
    var before = Number(game.state.cuddleMoney) || 0;
    var selling = String(button.getAttribute("data-shop-item-id")).indexOf("sell:") === 0;
    window.setTimeout(function () {
      var after = Number(game.state && game.state.cuddleMoney) || 0;
      if (after === before) play("invalid");
      else play(selling || after > before ? "sell" : "buy");
    }, 0);
  }, true);
  wrap("fishCard", function (result) { if (!result || result.ok !== false) play("fish"); });

  // Entering a stop: by what it is.
  wrap("enterBranchNode", function (result) {
    if (!result || result.ok === false) { if (result && result.error) play("invalid"); return; }
    var map = this.state && this.state.branchMap;
    var spot = map && map.position;
    var node = spot && map.rows[spot.row] && map.rows[spot.row].nodes[spot.col];
    var type = node && (node.type === "mystery" && node.mysteryType ? node.mysteryType : node.type);
    if (type === "boss" || type === "final") return; // its entrance plays its own
    if (type === "trial") play("trial");
    else if (type === "duel") play("duel");
    else if (type === "shop") play("shop");
    else if (type === "event" || type === "upgrade") play("toast");
    else play("stage");
  });

  // Winning and losing, whichever way the run gets there: every change of
  // the run's status passes through a save.
  wrap("save", function () {
    var state = this.state;
    if (!state || String(state.runId || "").indexOf(":duel:") !== -1) return;
    var key = (state.runId || "") + ":" + state.status;
    var previous = this.__umtSoundStatus;
    this.__umtSoundStatus = key;
    if (!previous || previous === key || previous.split(":")[0] !== String(state.runId || "")) return;
    if (state.status === "won") play("win");
    else if (state.status === "lost") play("lose");
  });

  // The deck running out and shuffling its discards back in.
  if (proto && typeof proto.drawCards === "function") {
    var baseDraw = proto.drawCards;
    proto.drawCards = function drawCardsWithSound() {
      var state = this.state;
      var empty = state && Array.isArray(state.deck) && !state.deck.length && Array.isArray(state.discard) && state.discard.length;
      var result = baseDraw.apply(this, arguments);
      if (empty && state.deck.length + state.hand.length > 0 && !(state.discard || []).length) play("shuffle");
      return result;
    };
  }

  // -- hooks into the screen -------------------------------------------------------
  // Taps that make a sound of their own.
  document.addEventListener("pointerdown", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    var card = target.closest("#cuddleScreen .cuddle-card.is-dead, #cuddleScreen .cuddle-card.is-lucky, #cuddleScreen .cuddle-card.is-idea, #cuddleScreen .cuddle-card.is-joker");
    if (card && !card.closest(".is-mulligan-mode")) {
      play(card.classList.contains("is-dead") ? "dead" : card.classList.contains("is-lucky") ? "lucky" : card.classList.contains("is-idea") ? "idea" : "joker");
    }
  }, true);
  document.addEventListener("click", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    // A soft click for every button, under any sound of its own.
    var button = target.closest("button, [role=\"button\"]");
    if (button && !button.disabled && !button.closest(".cuddle-card, .cuddle-tile, .umt-sound-panel")
        && (button.closest("#cuddleScreen") || button.closest(".umt-pack-overlay, .umt-pt-layer"))) {
      play("tap");
    }
    if (target.closest(".umt-duel-reward")) play("reward");
    if (target.closest('[data-cuddle-money-action="collect-payout"]')) play("collect");
    else if (target.closest('[data-umt-pack="buy"]')) play("pack");
    else if (target.closest('[data-action="refresh-rewards"], [data-action="refresh-upgrades"], .cuddle-upgrade-refresh')) play("refresh");
    else if (target.closest('[data-action="skip-upgrade"]')) play("skip");
  }, true);

  // What appears on screen: a boss's entrance, a wave, a dragged card, an
  // achievement, the cash-out (whose rows count up one by one).
  function watchPayout(overlay) {
    if (!overlay || overlay.__umtSound) return;
    overlay.__umtSound = true;
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        var el = record.target;
        if (el.classList && el.classList.contains("cuddle-money-payout-row") && el.classList.contains("is-counting")) play("cashRow");
      });
    }).observe(overlay, { attributes: true, attributeFilter: ["class"], subtree: true });
  }

  // A sound a moment from now, if `el` is still on screen then.
  function later(el, ms, name, arg) {
    window.setTimeout(function () { if (el.isConnected) play(name, arg); }, Math.max(0, ms));
  }

  // The pack's badges flying out, each as it lands (cuddle-packs.js times
  // them from the offer's openedAt: 260ms, then one per 230ms, 720ms each).
  function packCards(dialog) {
    var game = null;
    try { game = window.CuddleBranchMap && window.CuddleBranchMap.getActiveGame(); } catch (_error) { /* no game */ }
    var offer = game && game.state && game.state.umtPackOffer;
    if (dialog.__umtSound) return;
    dialog.__umtSound = true;
    var elapsed = offer ? Date.now() - (Number(offer.openedAt) || 0) : 0;
    if (!offer || elapsed > 400) return;
    dialog.querySelectorAll(".umt-pack-card").forEach(function (card, index) {
      var tier = (card.className.match(/\bis-(common|rare|epic|legendary)\b/) || [])[1] || "common";
      later(dialog, 260 + index * 230 + 580 - elapsed, "packCard", tier);
    });
  }

  // The badge board's reveal: each new badge pops into place one beat
  // (1.6s) after the last (cuddle-progression.css), with a bing.
  function badgeBings(overlay) {
    if (overlay.__umtSound) return;
    overlay.__umtSound = true;
    var layer = overlay.closest(".umt-pt-layer");
    if (layer && layer.classList.contains("is-settled")) return;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    overlay.querySelectorAll(".umt-bd-badge.is-new:not(.is-combo)").forEach(function (badge, index) {
      var step = Number(badge.style.getPropertyValue("--step")) || 0;
      later(overlay, reduced ? 300 + index * 140 : 650 + step * 1600, "bing", step);
    });
  }

  function added(node) {
    if (!(node instanceof Element)) return;
    var cls = node.classList;
    if (cls.contains("umt-boss-entrance") || node.querySelector(".umt-boss-entrance")) {
      var entrance = cls.contains("umt-boss-entrance") ? node : node.querySelector(".umt-boss-entrance");
      play(entrance.classList.contains("is-rival") ? "duel" : "boss");
    }
    if (cls.contains("umt-wave-layer")) play("wave");
    var dialog = node.matches(".umt-pack-dialog.is-opened") ? node : node.querySelector(".umt-pack-dialog.is-opened");
    if (dialog) packCards(dialog);
    var board = node.matches(".umt-pt-overlay.is-reveal") ? node : node.querySelector(".umt-pt-overlay.is-reveal");
    if (board) badgeBings(board);
    if (cls.contains("umt-cs")) later(node, 1000, "coin");
    if (cls.contains("drag-letter-ghost")) play("drag");
    if (cls.contains("umt-ach-toast")) play("toast");
    if (cls.contains("umt-hint-fx-tile")) play("hint");
    if (node.id === "cuddleMoneyPayoutOverlay") watchPayout(node);
    else if (node.querySelector) watchPayout(node.querySelector("#cuddleMoneyPayoutOverlay"));
  }

  // -- the speaker button and its switches ---------------------------------------
  var ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function paint() {
    var any = settings.music || settings.sfx;
    document.querySelectorAll(".umt-music-btn").forEach(function (button) {
      button.innerHTML = any ? ON : OFF;
      button.setAttribute("aria-label", "Sound settings: music " + (settings.music ? "on" : "off") + ", sound effects " + (settings.sfx ? "on" : "off"));
      button.setAttribute("aria-haspopup", "true");
      button.classList.toggle("is-muted", !any);
      button.title = "Sound";
    });
    var panel = document.querySelector(".umt-sound-panel");
    if (panel) {
      panel.querySelectorAll("[data-umt-sound]").forEach(function (box) {
        var on = settings[box.getAttribute("data-umt-sound")];
        box.setAttribute("aria-checked", on ? "true" : "false");
        box.querySelector("b").textContent = on ? "On" : "Off";
      });
    }
  }

  function makeButton() {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "cuddle-icon-btn umt-music-btn";
    return button;
  }

  // A speaker button beside the "?" in Cuddle's top bars (or first on the
  // right of the road's and the shop's).
  function decorate() {
    document.querySelectorAll("#cuddleScreen .cuddle-icon-btn[data-action=\"rules\"]").forEach(function (rules) {
      var before = rules.previousElementSibling;
      if (before && before.classList.contains("umt-music-btn")) return;
      rules.parentNode.insertBefore(makeButton(), rules);
    });
    document.querySelectorAll("#cuddleScreen .cuddle-header").forEach(function (header) {
      if (header.querySelector(".umt-music-btn")) return;
      var side = header.querySelector(".cuddle-header-side-right");
      if (side) side.insertBefore(makeButton(), side.firstChild);
    });
    paint();
  }

  function closePanel() {
    var panel = document.querySelector(".umt-sound-panel");
    if (panel) panel.remove();
  }

  function openPanel(button) {
    closePanel();
    var box = button.getBoundingClientRect();
    var panel = document.createElement("div");
    panel.className = "umt-sound-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Sound");
    panel.innerHTML = "<button type=\"button\" role=\"switch\" data-umt-sound=\"music\"><span>Music</span><b></b></button>"
      + "<button type=\"button\" role=\"switch\" data-umt-sound=\"sfx\"><span>Sound effects</span><b></b></button>";
    panel.style.top = Math.round(box.bottom + 8) + "px";
    panel.style.right = Math.max(8, Math.round(window.innerWidth - box.right)) + "px";
    document.body.appendChild(panel);
    paint();
    var first = panel.querySelector("button");
    if (first) first.focus({ preventScroll: true });
  }

  document.addEventListener("click", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    var toggle = target.closest(".umt-sound-panel [data-umt-sound]");
    if (toggle) {
      var name = toggle.getAttribute("data-umt-sound");
      settings[name] = !settings[name];
      writeSetting(name, settings[name]);
      unlocked = true;
      syncMusic();
      paint();
      if (name === "sfx" && settings.sfx) play("pick");
      return;
    }
    var button = target.closest(".umt-music-btn");
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      if (document.querySelector(".umt-sound-panel")) closePanel();
      else openPanel(button);
      return;
    }
    if (!target.closest(".umt-sound-panel")) closePanel();
  }, true);
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") closePanel(); });
  window.addEventListener("scroll", closePanel, true);

  // -- the first tap unlocks sound -------------------------------------------------
  function firstTap(event) {
    if (unlocked) return;
    var el = screen();
    if (!el || !(event.target instanceof Element) || !el.contains(event.target)) return;
    unlocked = true;
    audioContext();
    if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") ctx.resume();
    window.setTimeout(syncMusic, 50);
  }
  document.addEventListener("pointerdown", firstTap, true);
  document.addEventListener("keydown", firstTap, true);
  document.addEventListener("visibilitychange", syncMusic);

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () {
      pending = false;
      decorate();
      syncMusic();
    });
  }

  function start() {
    new MutationObserver(function (records) {
      records.forEach(function (record) { record.addedNodes.forEach(added); });
      schedule();
    }).observe(document.body, { childList: true, subtree: true });
    var el = screen();
    if (el) new MutationObserver(syncMusic).observe(el, { attributes: true, attributeFilter: ["class"] });
    schedule();
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.CuddleAudio = Object.freeze({
    play: play,
    sounds: Object.keys(SOUNDS),
    settings: function () { return { music: settings.music, sfx: settings.sfx }; }
  });
}());
