/* Cuddle: music and sound effects.
 *
 * Music: the run's theme (two pieces, back and forth), the boss fights',
 * the Word Duels' and the shop's, plus a victory piece when a boss is beaten or the run won and
 * a loss piece when it's lost; only once a run is on screen (the road, a
 * stage, the shop...), not on Cuddle's start screen.
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
 * one, and every later tap wakes the sound again if the browser put it to
 * sleep (a phone does when you switch apps). The music plays through the
 * same Web Audio output as the effects, so its volume holds on phones too
 * (an iPhone ignores a page's volume for plain audio). The speaker button
 * in Cuddle's top bars opens the settings: Music Off / Quiet / Normal, and
 * Sound effects on or off; both are remembered.
 */
(function () {
  "use strict";

  if (window.CuddleAudio) return;

  var Engine = window.CuddleEngine;
  var proto = Engine && Engine.CuddleGame && Engine.CuddleGame.prototype;

  // -- settings --------------------------------------------------------------------
  var KEYS = { music: "umt-cuddle-music", sfx: "umt-cuddle-sfx" };
  // Music and sound effects: each "off", "quiet" or "normal" (an older
  // "on" reads as normal).
  var MUSIC_LEVELS = { off: 0, quiet: 0.0078, normal: 0.026 };
  var SFX_LEVELS = { off: 0, quiet: 0.36, normal: 0.45 };
  var CHOICES = [["off", "Off"], ["quiet", "Quiet"], ["normal", "Normal"]];
  function readSetting(name) {
    var value = null;
    try { value = localStorage.getItem(KEYS[name]); } catch (_error) { /* not remembered */ }
    return value === "off" || value === "quiet" ? value : "normal";
  }
  function writeSetting(name, value) {
    try { localStorage.setItem(KEYS[name], value); } catch (_error) { /* not remembered */ }
  }
  var settings = { music: readSetting("music"), sfx: readSetting("sfx") };
  // A tap has happened, so the browser lets this page make sound. It never
  // goes back to false: a refused play is retried on the next tap.
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
  // Slots: the run's theme, the boss fights', the shop's, and two that play
  // once over a moment: a victory (a boss beaten, the run won) and a loss.
  // The one that fits the screen plays; switching crossfades, and the
  // others start from the top each time (the theme picks up where it was).
  // The theme and the boss have two pieces each: either one first, at
  // random, and when it ends the other plays, back and forth. A victory is
  // one of its two pieces, at random.
  var TRACKS = {
    theme: { list: ["cuddle/audio/cuddle-theme.mp3", "cuddle/audio/cuddle-theme-2.mp3"], resume: true },
    // Echo Mountains' own song, in place of the theme there.
    mountains: { src: "cuddle/audio/cuddle-theme-3.mp3", resume: true },
    boss: { list: ["cuddle/audio/cuddle-boss.mp3", "cuddle/audio/cuddle-boss-2.mp3"], restart: true },
    shop: { src: "cuddle/audio/cuddle-shop.mp3", restart: true },
    duel: { src: "cuddle/audio/cuddle-duel.mp3", restart: true },
    victory: { list: ["cuddle/audio/cuddle-victory.mp3", "cuddle/audio/cuddle-victory-2.mp3"], once: true },
    loss: { src: "cuddle/audio/cuddle-loss.mp3", once: true, restart: true }
  };
  // The victory or loss playing over the screen: { name, runId }. It holds
  // until its piece ends; then the screen's own music comes back (none on
  // the run's end screen).
  var moment = null;
  function startMoment(name, runId) {
    if (moment && moment.name === name && moment.runId === runId) return;
    moment = { name: name, runId: runId };
    syncMusic();
  }
  function endMoment(track) {
    if (!moment || TRACKS[moment.name] !== track) return;
    moment = null;
    syncMusic();
  }

  function randomPiece(track) {
    return track.list[Math.floor(Math.random() * track.list.length)];
  }

  // A playlist slot moves on to its next piece when one ends.
  function nextPiece(track) {
    var at = track.list.indexOf(track.piece);
    track.piece = track.list[(at + 1) % track.list.length];
    track.el.src = track.piece;
    if (current !== track) return;
    var playing = track.el.play();
    if (playing && typeof playing.catch === "function") playing.catch(function blocked() { track.target = -1; });
  }
  // It eases in slowly at the start of a run, crossfades between tracks,
  // and steps out quickly.
  var FADE_IN_MS = 4000;
  var CROSS_MS = 1200;
  var FADE_OUT_MS = 700;
  var CHANGE_MS = 600;
  var current = null;

  function ensureTrack(name) {
    var track = TRACKS[name];
    if (track.el) return track;
    if (track.list) track.piece = randomPiece(track);
    track.el = new Audio(track.list ? track.piece : track.src);
    track.el.loop = !track.list && !track.once;
    if (track.once) track.el.addEventListener("ended", function () { endMoment(track); });
    else if (track.list) track.el.addEventListener("ended", function () { nextPiece(track); });
    track.el.preload = "auto";
    track.fade = 0;
    track.target = -1;
    var ac = audioContext();
    if (ac && typeof ac.createMediaElementSource === "function") {
      try {
        var source = ac.createMediaElementSource(track.el);
        track.gain = ac.createGain();
        track.gain.gain.value = 0;
        source.connect(track.gain);
        track.gain.connect(ac.destination);
      } catch (_error) {
        track.gain = null;
      }
    }
    if (!track.gain) track.el.volume = 0;
    return track;
  }

  function level(track) {
    return track.gain ? track.gain.gain.value : track.el.volume;
  }

  // Fades a track to a level. A repeat call for the same level keeps the
  // fade already running, since the page re-syncs on every DOM change.
  function ramp(track, to, done, ms) {
    if (!track.el || to === track.target) return;
    track.target = to;
    window.clearInterval(track.fade);
    if (track.gain) {
      var gain = track.gain.gain;
      var now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(to, now + ms / 1000);
      track.fade = window.setInterval(function finished() {
        window.clearInterval(track.fade);
        if (done) done();
      }, ms);
      return;
    }
    var from = track.el.volume;
    var started = Date.now();
    track.fade = window.setInterval(function step() {
      var t = Math.min(1, (Date.now() - started) / ms);
      track.el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t >= 1) {
        window.clearInterval(track.fade);
        if (done) done();
      }
    }, 50);
  }

  function silence(track, ms) {
    if (!track.el || track.el.paused) return;
    ramp(track, 0, function stop() {
      if (current !== track) {
        track.el.pause();
        track.target = -1;
      }
    }, ms);
  }

  // Which track fits what's on screen.
  function inMountains(game) {
    try {
      var world = game && game.state && game.state.runId && window.CuddleWorlds ? window.CuddleWorlds.currentWorld(game) : null;
      return Boolean(world && world.theme === "mountains");
    } catch (_error) {
      return false;
    }
  }

  function trackFor() {
    var game = null;
    try { game = window.CuddleBranchMap && window.CuddleBranchMap.getActiveGame(); } catch (_error) { /* none */ }
    var state = game && game.state;
    var el = screen();
    if (moment && state && String(state.runId || "") !== moment.runId) moment = null;
    if (moment) return moment.name;
    // The run's end screen is quiet once its victory or loss has played.
    if (state && (state.status === "won" || state.status === "lost")) return null;
    if ((state && state.status === "shop") || (el && el.querySelector(".umt-shop-page"))) return "shop";
    var entrance = document.querySelector(".umt-boss-entrance");
    if (entrance && !entrance.classList.contains("is-rival")) return "boss";
    // A Word Duel: from the rival's entrance until the Duel is over.
    if (entrance && entrance.classList.contains("is-rival")) return "duel";
    var duel = state && state.branchMap && state.branchMap.expandedDuel;
    if (duel && duel.phase === "playing") return "duel";
    // A quest reward pick mid-fight is still the fight.
    if (state && (state.status === "playing" || state.status === "questReward") && state.boss && !state.boss.__umtSynthetic
        && String(state.runId || "").indexOf(":duel:") === -1) return "boss";
    return inMountains(game) ? "mountains" : "theme";
  }

  function wantMusic() {
    return settings.music !== "off" && unlocked && inRun();
  }

  function syncMusic() {
    var name = wantMusic() ? trackFor() : null;
    if (!name) {
      var leaving = current;
      current = null;
      Object.keys(TRACKS).forEach(function (name) { if (TRACKS[name].el) silence(TRACKS[name], FADE_OUT_MS); });
      return leaving;
    }
    var track = ensureTrack(name);
    var switching = current && current !== track;
    var fresh = !current;
    current = track;
    wake();
    Object.keys(TRACKS).forEach(function (name) { if (TRACKS[name] !== track && TRACKS[name].el) silence(TRACKS[name], CROSS_MS); });
    var wasPlaying = !track.el.paused && track.target > 0;
    if (track.el.paused) {
      if (track.list && track.resume) {
        // The theme carries on where it was.
      } else if (track.list) {
        // A new fight: either piece, from the top.
        var piece = randomPiece(track);
        if (piece !== track.piece) { track.piece = piece; track.el.src = piece; }
        else { try { track.el.currentTime = 0; } catch (_error) { /* not loaded yet */ } }
      } else if (track.restart) { try { track.el.currentTime = 0; } catch (_error) { /* not loaded yet */ } }
      var playing = track.el.play();
      // Refused (no tap yet since the browser put sound to sleep): the
      // next tap tries again.
      if (playing && typeof playing.catch === "function") playing.catch(function blocked() { track.target = -1; });
    }
    ramp(track, MUSIC_LEVELS[settings.music], null, wasPlaying ? CHANGE_MS : switching ? CROSS_MS : fresh ? FADE_IN_MS : CROSS_MS);
  }

  // -- sound effects ---------------------------------------------------------------
  var ctx = null;
  var master = null;
  var noiseBuffer = null;

  function audioContext() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    // On an iPhone, Web Audio alone follows the silent switch (so effects
    // came and went with the music); this page's sound is its point.
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (_error) { /* older Safari */ }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = SFX_LEVELS[settings.sfx] || 0;
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

  var C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99, B5 = 987.77, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568;

  // All soft and small: sine and triangle tones (nothing buzzy), quiet,
  // mostly on a five-note scale so things that happen together agree.
  var SCALE = [C6, 1174.7, E6, G6, A5 * 2];
  function step(i) { return SCALE[Math.max(0, Math.min(SCALE.length - 1, i))]; }

  var SOUNDS = {
    // Tiles: a little beep, one note higher for each letter of the word,
    // and back down a note when one comes off.
    pick: function (count) { var f = step(count - 1); tone({ f: f, f2: f * 1.04, dur: 0.07, type: "sine", vol: 0.06, attack: 0.004 }); tone({ f: f * 2, dur: 0.04, type: "sine", vol: 0.012, attack: 0.004 }); },
    remove: function (count) { var f = step(count); tone({ f: f, f2: f * 0.92, dur: 0.07, type: "sine", vol: 0.05, attack: 0.004 }); },
    // Any button: a barely-there tick.
    tap: function () { tone({ f: 2000, dur: 0.02, type: "sine", vol: 0.01, attack: 0.002 }); },
    // A badge tapped to look at it: a tiny rising glint.
    peek: function () { tone({ f: G6, f2: C6 * 2, dur: 0.14, type: "sine", vol: 0.035, attack: 0.01 }); tone({ f: G6 * 2, dur: 0.1, type: "sine", vol: 0.01, delay: 0.04 }); },
    drag: function () { tone({ f: 880, f2: 990, dur: 0.05, type: "sine", vol: 0.03, attack: 0.004 }); },
    drop: function () { tone({ f: 990, f2: 880, dur: 0.07, type: "sine", vol: 0.05, attack: 0.004 }); tone({ f: E6, dur: 0.05, type: "sine", vol: 0.015, delay: 0.03 }); },
    // A guess's tiles as they turn (cuddle-feedback-fx.js), by column:
    // greens climb the scale, so a row of them rings out.
    tileGrey: function () { tone({ f: 330, f2: 300, dur: 0.08, type: "sine", vol: 0.06, attack: 0.004 }); },
    tileYellow: function (i) { var f = 880 * Math.pow(1.03, i); tone({ f: f, dur: 0.14, type: "sine", vol: 0.07, attack: 0.004 }); tone({ f: f * 2, dur: 0.06, type: "sine", vol: 0.015, attack: 0.004 }); },
    tileGreen: function (i) { var f = [G5, A5, C6, 1174.7, E6][i % 5]; tone({ f: f, dur: 0.22, type: "triangle", vol: 0.08, attack: 0.004 }); tone({ f: f * 2, dur: 0.12, type: "sine", vol: 0.02, delay: 0.01 }); },
    // Not a word: a little "uh-oh".
    invalid: function () { tone({ f: E5, dur: 0.1, type: "sine", vol: 0.06, attack: 0.005 }); tone({ f: C5, dur: 0.16, type: "sine", vol: 0.06, attack: 0.005, delay: 0.11 }); },
    hint: function () { notes([A5, C6, E6], 0.06, { type: "sine", vol: 0.06, dur: 0.18 }); },
    shuffle: function () { [0, 0.06, 0.12].forEach(function (d) { noise({ f: 2500, q: 1, dur: 0.05, vol: 0.03, delay: d }); }); },
    mulligan: function () { SOUNDS.shuffle(); tone({ f: C5, f2: G5, dur: 0.12, type: "sine", vol: 0.05, attack: 0.005, delay: 0.2 }); },
    // A badge landing in the collection: a small bell, a step higher for
    // each one in a row.
    bing: function (i) { var f = E6 * Math.pow(1.122, i % 4); tone({ f: f, dur: 0.6, type: "sine", vol: 0.08, attack: 0.004 }); tone({ f: f * 2.76, dur: 0.18, type: "sine", vol: 0.015, attack: 0.002 }); tone({ f: f / 2, dur: 0.25, type: "triangle", vol: 0.02 }); },
    // A quest reward taken: two bells.
    reward: function () { tone({ f: C6, dur: 0.3, type: "sine", vol: 0.08, attack: 0.003 }); tone({ f: G6, dur: 0.7, type: "sine", vol: 0.09, attack: 0.003, delay: 0.09 }); tone({ f: G6 * 2.76, dur: 0.18, type: "sine", vol: 0.015, delay: 0.09 }); },
    // Opening a pack (cuddle-packs.js): rustling that builds as it shakes,
    // a swell, then the rip.
    pack: function () {
      [0, 0.1, 0.19, 0.28, 0.36, 0.44, 0.51, 0.57].forEach(function (d, i) { noise({ f: 1800 + i * 160, q: 1.2, dur: 0.05, vol: 0.015 + i * 0.006, delay: d }); });
      noise({ f: 600, f2: 2200, q: 0.7, dur: 0.34, vol: 0.04, delay: 0.62, attack: 0.3 });
      noise({ f: 3200, f2: 1200, q: 0.9, dur: 0.22, vol: 0.09, delay: 0.96, attack: 0.01 });
      notes([E6, G6, C6 * 2], 0.05, { type: "sine", vol: 0.04, dur: 0.3, delay: 1.0 });
    },
    // One badge flying out of the pack, brighter for a rarer one.
    packCard: function (tier) {
      var f = { common: A5, rare: C6, epic: E6, legendary: G6 }[tier] || A5;
      tone({ f: f * 0.75, f2: f, dur: 0.08, type: "sine", vol: 0.05 });
      tone({ f: f, dur: 0.28, type: "sine", vol: 0.07, delay: 0.05 });
      if (tier === "epic" || tier === "legendary") notes([f * 1.5, f * 2], 0.05, { type: "sine", vol: 0.03, dur: 0.22, delay: 0.1 });
    },
    // The coin dropping into the cabinet (cuddle-coin-start.js).
    coin: function () { tone({ f: 1976, dur: 0.45, type: "sine", vol: 0.08, attack: 0.002 }); tone({ f: 2637, dur: 0.4, type: "sine", vol: 0.06, attack: 0.002, delay: 0.07 }); tone({ f: 5274, dur: 0.12, type: "sine", vol: 0.012, delay: 0.07 }); },
    cashRow: function () { tone({ f: 1320 + Math.random() * 120, dur: 0.06, type: "sine", vol: 0.05 }); },
    // A word found (cuddle-solve-fx.js): a bright little jingle as the row
    // bounces, then a two-note chime under "Word found!".
    solve: function () {
      notes([C6, E6, G6, C6 * 2], 0.07, { type: "sine", vol: 0.07, dur: 0.26 });
      tone({ f: C6 * 2, dur: 0.5, type: "triangle", vol: 0.04, delay: 0.3 });
    },
    found: function () {
      tone({ f: G5, dur: 0.35, type: "sine", vol: 0.08, attack: 0.004 });
      tone({ f: E6, dur: 0.7, type: "sine", vol: 0.09, attack: 0.004, delay: 0.12 });
      tone({ f: E6 * 2.76, dur: 0.18, type: "sine", vol: 0.012, delay: 0.12 });
    },
    // Every cash-out row paid: quick ticks climbing (the rows adding up)
    // landing on a warm chord.
    sum: function () {
      [0, 1, 2, 3, 4].forEach(function (i) { tone({ f: 1320 * Math.pow(1.06, i), dur: 0.05, type: "sine", vol: 0.035, delay: i * 0.045 }); });
      [C6, E6, G6].forEach(function (f, i) { tone({ f: f, dur: 0.55, type: "sine", vol: 0.045, attack: 0.008, delay: 0.24 + i * 0.015 }); });
    },
    // A tile marked for a mulligan: a small soft bloop (like a dead card,
    // lighter); unmarked: it bobs back up.
    markMulligan: function () { tone({ f: 520, f2: 300, dur: 0.11, type: "sine", vol: 0.045, attack: 0.005 }); },
    unmarkMulligan: function () { tone({ f: 300, f2: 420, dur: 0.08, type: "sine", vol: 0.035, attack: 0.005 }); },
    // A cash-out row that costs points: a soft "wah-wah" going down.
    cashMinus: function () { tone({ f: 494, f2: 440, dur: 0.13, type: "triangle", vol: 0.06, attack: 0.006 }); tone({ f: 415, f2: 330, dur: 0.24, type: "triangle", vol: 0.06, attack: 0.006, delay: 0.13 }); },
    collect: function () { [0, 0.05, 0.1, 0.15, 0.2].forEach(function (d, i) { tone({ f: 1400 + i * 120, dur: 0.08, type: "sine", vol: 0.05, delay: d }); }); notes([C6, E6], 0.08, { type: "sine", delay: 0.25, vol: 0.08 }); },
    // Into a stage: a soft swoosh.
    stage: function () { noise({ f: 400, f2: 2400, q: 0.8, dur: 0.3, vol: 0.07, attack: 0.12 }); noise({ f: 2400, f2: 1000, q: 0.8, dur: 0.18, vol: 0.025, delay: 0.24 }); },
    trial: function () { notes([A5 / 2, E5, A5], 0.14, { type: "sine", vol: 0.07, dur: 0.5 }); },
    duel: function () { notes([E5, F5, B5], 0.15, { type: "triangle", vol: 0.06, dur: 0.22 }); },
    boss: function () { noise({ kind: "lowpass", f: 220, dur: 0.6, vol: 0.15 }); tone({ f: 110, f2: 82, dur: 1.1, type: "triangle", vol: 0.1 }); tone({ f: 165, f2: 123, dur: 1.1, type: "sine", vol: 0.04, delay: 0.05 }); },
    shop: function () { tone({ f: 1760, dur: 0.3, type: "sine", vol: 0.06 }); tone({ f: 2217, dur: 0.4, type: "sine", vol: 0.05, delay: 0.12 }); },
    buy: function () { tone({ f: 1568, dur: 0.06, type: "sine", vol: 0.05 }); tone({ f: 2093, dur: 0.22, type: "sine", vol: 0.07, delay: 0.07 }); },
    sell: function () { tone({ f: 2093, dur: 0.07, type: "sine", vol: 0.06 }); tone({ f: 1568, dur: 0.18, type: "sine", vol: 0.06, delay: 0.08 }); },
    fish: function () { noise({ f: 900, f2: 400, q: 0.7, dur: 0.28, vol: 0.07 }); [0.25, 0.31, 0.37].forEach(function (d) { tone({ f: 1200, dur: 0.03, type: "sine", vol: 0.03, delay: d }); }); },
    quest: function () { notes([E5, G5, C6, E6], 0.07, { type: "sine", vol: 0.08 }); },
    square: function () { tone({ f: 1046, f2: 2093, dur: 0.15, type: "sine", vol: 0.07 }); },
    // Special cards tapped.
    dead: function () { tone({ f: 440, f2: 220, dur: 0.15, type: "sine", vol: 0.07, attack: 0.005 }); },
    lucky: function () { notes([E6, G6, E6 * 1.5], 0.05, { type: "sine", vol: 0.05, dur: 0.14 }); },
    idea: function () { tone({ f: 1760, dur: 0.45, type: "sine", vol: 0.07 }); tone({ f: 2637, dur: 0.35, type: "sine", vol: 0.03, delay: 0.02 }); },
    joker: function () { [0, 1, 2, 3, 4].forEach(function (i) { tone({ f: 700 * Math.pow(1.19, i), dur: 0.09, type: "sine", vol: 0.05, delay: i * 0.04 }); }); },
    wave: function () { noise({ f: 300, f2: 1400, q: 0.6, dur: 0.9, vol: 0.1, attack: 0.25 }); noise({ f: 1400, f2: 400, q: 0.6, dur: 0.8, vol: 0.06, delay: 0.5, attack: 0.1 }); },
    win: function () { notes([C5, E5, G5, C6], 0.12, { type: "sine", vol: 0.1, dur: 0.25 }); notes([E6, G6], 0.0, { delay: 0.5, vol: 0.07, dur: 0.7, type: "sine" }); tone({ f: C6, dur: 0.8, type: "triangle", vol: 0.08, delay: 0.5 }); },
    lose: function () { notes([G5, E5, D5, C5 / 1.06], 0.2, { type: "sine", vol: 0.08, dur: 0.35 }); },
    refresh: function () { noise({ f: 1500, f2: 3000, q: 1, dur: 0.16, vol: 0.04 }); },
    skip: function () { tone({ f: 660, f2: 520, dur: 0.09, type: "sine", vol: 0.05 }); },
    toast: function () { notes([G5, C6], 0.08, { type: "sine", vol: 0.06, dur: 0.22 }); }
  };

  // Wakes the output if the browser put it to sleep (no tap yet, another
  // app, a locked phone). Only works inside a tap, or once one has landed.
  function wake() {
    if (!ctx || ctx.state === "running" || typeof ctx.resume !== "function") return;
    try {
      var resumed = ctx.resume();
      if (resumed && typeof resumed.catch === "function") resumed.catch(function () { /* next tap */ });
    } catch (_error) { /* next tap */ }
  }

  var lastPlayed = {};
  function play(name, arg) {
    if (settings.sfx === "off" || !unlocked || !SOUNDS[name] || !inCuddle()) return;
    var now = Date.now();
    if (lastPlayed[name] && now - lastPlayed[name] < 45) return;
    lastPlayed[name] = now;
    // A test can list what played (window.__umtSoundLog = []).
    if (Array.isArray(window.__umtSoundLog)) window.__umtSoundLog.push(name);
    var ac = audioContext();
    if (!ac) return;
    if (ac.state !== "running") {
      wake();
      // Asleep outside a tap: the sound would only pile up and burst out
      // with the next ones once something wakes the output.
      var activation = navigator.userActivation;
      if (activation && !activation.isActive) return;
    }
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
    var count = filled(this.state);
    play(count < before.draft ? "remove" : "pick", count);
  });
  wrap("removeDraftAt", function (result) { if (result && result.ok !== false) play("remove", filled(this.state)); });
  wrap("backspaceDraft", function (result) { if (!result || result.ok !== false) play("remove", filled(this.state)); });
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
    else if (type === "event" || type === "upgrade" || type === "levelup") play("toast");
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
    if (state.status === "won") { play("win"); startMoment("victory", String(state.runId || "")); }
    else if (state.status === "lost") { play("lose"); startMoment("loss", String(state.runId || "")); }
  });

  // A boss beaten (not a challenge dressed as one, not the Duel's rival):
  // a victory piece over whatever comes next.
  if (proto && typeof proto._clearBoss === "function") {
    var baseClearBoss = proto._clearBoss;
    proto._clearBoss = function clearBossWithMusic() {
      var boss = this.state && this.state.boss;
      var result = baseClearBoss.apply(this, arguments);
      try {
        var runId = String(this.state && this.state.runId || "");
        if (boss && !boss.__umtSynthetic && runId.indexOf(":duel:") === -1) startMoment("victory", runId);
      } catch (_error) { /* never block the game */ }
      return result;
    };
  }

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
    // Choosing tiles to mulligan away (the hand stays put; the Mulligan
    // bar below it is in its mulligan mode).
    var mulliganing = Boolean(document.querySelector("#cuddleScreen .cuddle-submit-row.is-mulligan-mode"));
    var handCard = target.closest("#cuddleScreen .cuddle-hand .cuddle-card");
    if (mulliganing && handCard) {
      if (!handCard.disabled) play(handCard.classList.contains("is-selected") ? "unmarkMulligan" : "markMulligan");
      return;
    }
    var card = target.closest("#cuddleScreen .cuddle-card.is-dead, #cuddleScreen .cuddle-card.is-lucky, #cuddleScreen .cuddle-card.is-idea, #cuddleScreen .cuddle-card.is-joker");
    if (card) {
      play(card.classList.contains("is-dead") ? "dead" : card.classList.contains("is-lucky") ? "lucky" : card.classList.contains("is-idea") ? "idea" : "joker");
    }
  }, true);
  document.addEventListener("click", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    // A soft click for every button, under any sound of its own.
    var button = target.closest("button, [role=\"button\"]");
    if (target.closest(".umt-bd-badge[data-umt-badge], [data-umt-help]")) play("peek");
    else if (button && !button.disabled && !button.closest(".cuddle-card, .cuddle-tile, .umt-sound-panel")
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
        if (el === overlay && el.classList.contains("is-summing") && !overlay.__umtSummed) {
          overlay.__umtSummed = true;
          play("sum");
          return;
        }
        if (!(el.classList && el.classList.contains("cuddle-money-payout-row") && el.classList.contains("is-counting"))) return;
        var amount = el.querySelector(".cuddle-money-row-increment");
        var negative = el.classList.contains("is-late") || /^\s*[-\u2212]/.test(amount ? amount.textContent.replace(/^\s*\d+\s*\u00d7\s*/, "") : "");
        play(negative ? "cashMinus" : "cashRow");
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
    var any = settings.music !== "off" || settings.sfx !== "off";
    var label = "Sound settings: music " + settings.music + ", sound effects " + settings.sfx;
    // Only what changed is written: this runs after every DOM change, and
    // a rewrite (even of the same value) would wake every observer again.
    document.querySelectorAll(".umt-music-btn").forEach(function (button) {
      var icon = any ? "on" : "off";
      if (button.getAttribute("data-icon") !== icon) {
        button.innerHTML = any ? ON : OFF;
        button.setAttribute("data-icon", icon);
      }
      if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
      if (button.getAttribute("aria-haspopup") !== "true") button.setAttribute("aria-haspopup", "true");
      button.classList.toggle("is-muted", !any);
      if (button.title !== "Sound") button.title = "Sound";
    });
    var panel = document.querySelector(".umt-sound-panel");
    if (panel) {
      panel.querySelectorAll("[data-umt-level]").forEach(function (option) {
        var on = settings[option.getAttribute("data-umt-for")] === option.getAttribute("data-umt-level");
        option.setAttribute("aria-checked", on ? "true" : "false");
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

  // One setting's Off / Quiet / Normal row.
  function levelRow(name, title) {
    var id = "umtSoundLabel-" + name;
    return "<div class=\"umt-sound-row\"><span id=\"" + id + "\">" + title + "</span>"
      + "<span class=\"umt-sound-seg\" role=\"radiogroup\" aria-labelledby=\"" + id + "\">"
      + CHOICES.map(function (choice) {
          return "<button type=\"button\" role=\"radio\" data-umt-for=\"" + name + "\" data-umt-level=\"" + choice[0] + "\">" + choice[1] + "</button>";
        }).join("")
      + "</span></div>";
  }

  function openPanel(button) {
    closePanel();
    var box = button.getBoundingClientRect();
    var panel = document.createElement("div");
    panel.className = "umt-sound-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Sound");
    panel.innerHTML = levelRow("music", "Music") + levelRow("sfx", "Sound effects");
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
    var choice = target.closest(".umt-sound-panel [data-umt-level]");
    if (choice) {
      var name = choice.getAttribute("data-umt-for");
      settings[name] = choice.getAttribute("data-umt-level");
      writeSetting(name, settings[name]);
      unlocked = true;
      if (name === "sfx" && master) master.gain.value = SFX_LEVELS[settings.sfx] || 0;
      syncMusic();
      paint();
      // A sample at the new level.
      if (name === "sfx") play("pick");
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

  // -- taps unlock sound -------------------------------------------------------------
  // Browsers count only some events as a tap that may start sound: the
  // end of a touch, a click, a key (not a finger going down). Each one
  // wakes the output and retries the music if it was refused; an iPhone
  // also wants a sound started inside the first tap.
  var primed = false;
  function onTap() {
    unlocked = true;
    var ac = audioContext();
    if (!ac) return;
    wake();
    if (!primed) {
      primed = true;
      try {
        var blank = ac.createBufferSource();
        blank.buffer = ac.createBuffer(1, 1, 22050);
        blank.connect(ac.destination);
        blank.start(0);
      } catch (_error) { /* not needed here */ }
    }
    if (wantMusic() && current && current.el.paused) current.target = -1;
    syncMusic();
  }
  ["pointerup", "touchend", "click", "keydown"].forEach(function (type) {
    document.addEventListener(type, onTap, true);
  });
  // Leaving the page stops the music at once (a hidden tab's timers are
  // slowed, so a fade could hang on); coming back starts it again, or the
  // next tap does if the browser wants one first.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      Object.keys(TRACKS).forEach(function (name) {
        var track = TRACKS[name];
        if (!track.el || track.el.paused) return;
        window.clearInterval(track.fade);
        if (track.gain) {
          track.gain.gain.cancelScheduledValues(ctx.currentTime);
          track.gain.gain.setValueAtTime(0, ctx.currentTime);
        } else {
          track.el.volume = 0;
        }
        track.el.pause();
        track.target = -1;
      });
      current = null;
      return;
    }
    syncMusic();
  });
  window.addEventListener("pageshow", syncMusic);

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
    // A victory or loss over the screen for the run on now (the world
    // crossing replays the victory if it had ended).
    moment: function (name) {
      var game = null;
      try { game = window.CuddleBranchMap && window.CuddleBranchMap.getActiveGame(); } catch (_error) { /* none */ }
      if (TRACKS[name] && game && game.state) startMoment(name, String(game.state.runId || ""));
    },
    sounds: Object.keys(SOUNDS),
    settings: function () { return { music: settings.music, sfx: settings.sfx, unlocked: unlocked, output: ctx ? ctx.state : "none", level: current && current.el ? level(current) : 0, playing: Boolean(current && current.el && !current.el.paused), track: current ? Object.keys(TRACKS).filter(function (n) { return TRACKS[n] === current; })[0] : null, piece: current && current.list ? current.piece : null }; }
  });
}());
