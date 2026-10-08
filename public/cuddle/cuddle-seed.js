/* Cuddle: seeded runs.
 *
 * Every run has a seed -- a short code like "K7Q2MX" -- and every roll the
 * game makes comes from it, so two players who start the same seed on the
 * same difficulty get the same map, the same words, the same bosses and
 * the same reward offers (as long as they choose the same way).
 *
 * game.random stays the one source of chance, but it no longer runs as one
 * long stream: it restarts at every new moment of the run (a stage, a
 * reward screen, the map at a new spot), from the seed plus that moment.
 * A mulligan or a reroll spent in one stage then can't shift the next
 * stage's word. (Each moment keeps its own place in its stream.) The word itself has its own stream, keyed by how many
 * words the run has had, so it doesn't depend on anything rolled before
 * it in the stage either. The stream's position is kept on the run, so a
 * reload carries on exactly where it was.
 *
 * Loaded straight after cuddle-engine.js, before any game is built.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  if (!Engine || !Engine.CuddleGame) return;
  var proto = Engine.CuddleGame.prototype;
  if (proto.__cuddleSeed) return;
  proto.__cuddleSeed = true;

  // No 0/O or 1/I, so a seed read aloud or off a screenshot types back in.
  var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var LENGTH = 6;
  var MAX_LENGTH = 16;

  function generate() {
    var out = "";
    for (var i = 0; i < LENGTH; i += 1) out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    return out;
  }

  // Any typed seed works: letters and digits, upper-cased, at most 16.
  function normalize(text) {
    return String(text == null ? "" : text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_LENGTH);
  }

  function hash(text) {
    var value = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      value ^= text.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function step(rng) {
    rng.s = (rng.s + 0x6d2b79f5) >>> 0;
    var t = rng.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function seedOf(game, state) {
    if (state && state.runSeed) {
      if (!game.__runSeed && String(state.runId || "").indexOf(":duel:") === -1) game.__runSeed = state.runSeed;
      return state.runSeed;
    }
    if (game.__runSeed) return game.__runSeed;
    if (state && state.runId && String(state.runId).indexOf(":duel:") === -1) {
      // A run saved before seeds existed gets one now.
      state.runSeed = generate();
      return state.runSeed;
    }
    return "";
  }

  // The moment of the run a roll belongs to.
  function scopeKey(game, state) {
    if (game.__rngScope) return game.__rngScope;
    var map = state.branchMap;
    var spot = map && map.position ? JSON.stringify(map.position) : "";
    var gates = Array.isArray(state.bossGatesDone) ? state.bossGatesDone.length : 0;
    return [state.round || 0, state.status || "", state.upgradePhase || "", gates, spot].join("|");
  }

  function seededRandom(game) {
    return function random() {
      if (game.__randomOverride) return game.__randomOverride();
      var state = game.state;
      var seed = seedOf(game, state);
      if (!seed || !state) return Math.random();
      var key = scopeKey(game, state);
      // Each moment keeps its own position, so coming back to a stage after
      // a quest reward carries on its draws instead of repeating them. Old
      // moments are dropped once the round moves on.
      var bank = state.umtRng;
      if (!bank || typeof bank !== "object" || !bank.streams || bank.round !== (state.round || 0)) {
        bank = state.umtRng = { round: state.round || 0, streams: {} };
      }
      var rng = { s: typeof bank.streams[key] === "number" ? bank.streams[key] : hash(seed + "|" + key) };
      var value = step(rng);
      bank.streams[key] = rng.s;
      return value;
    };
  }

  // game.random is an accessor: the engine's constructor still assigns its
  // default (Math.random), which is ignored; any other function assigned
  // (a test's fixed roll) takes over until it is cleared with null.
  Object.defineProperty(proto, "random", {
    configurable: true,
    get: function getRandom() {
      if (!Object.prototype.hasOwnProperty.call(this, "__seededRandom")) {
        Object.defineProperty(this, "__seededRandom", { value: seededRandom(this), configurable: true });
      }
      return this.__seededRandom;
    },
    set: function setRandom(fn) {
      this.__randomOverride = typeof fn === "function" && fn !== Math.random ? fn : null;
    }
  });

  // A new run takes the seed handed to it (window.CuddleSeed.next, set by
  // the lobby) or a fresh one.
  var baseStartNew = proto.startNew;
  proto.startNew = function startNewSeeded() {
    var seed = normalize(pending) || generate();
    pending = "";
    this.__runSeed = seed;
    var result = baseStartNew.apply(this, arguments);
    if (this.state) this.state.runSeed = seed;
    if (typeof this.save === "function") this.save();
    return result;
  };

  // The word: its own stream per word of the run.
  var basePickSecret = proto._pickSecret;
  if (typeof basePickSecret === "function") {
    proto._pickSecret = function pickSecretSeeded() {
      var state = this.state;
      var used = state && Array.isArray(state.usedSecrets) ? state.usedSecrets.length : 0;
      var outer = this.__rngScope;
      var saved = state ? state.umtRng : null;
      if (state) state.umtRng = null;
      this.__rngScope = "word|" + used;
      try {
        return basePickSecret.apply(this, arguments);
      } finally {
        this.__rngScope = outer;
        if (state) state.umtRng = saved;
      }
    };
  }

  var pending = "";

  window.CuddleSeed = Object.freeze({
    generate: generate,
    normalize: normalize,
    // The seed the next new run starts from (empty: a random one).
    setNext: function setNext(text) { pending = normalize(text); },
    current: function current(game) {
      return game && game.state ? normalize(game.state.runSeed || game.__runSeed || "") : "";
    },
    // Seed text for layers that hash their own rolls (shop shelves, route
    // lanes, packs): the run's seed when it has one, else its id.
    text: function text(state) {
      if (state && state.runSeed) return "seed:" + state.runSeed;
      return String((state && state.runId) || "run");
    }
  });
}());
