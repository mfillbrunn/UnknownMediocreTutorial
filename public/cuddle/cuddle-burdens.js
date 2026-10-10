/* Cuddle: dead tiles and doubled consonants.
 *
 * Two deck burdens a run can pick up, as the price of a bargain or a
 * harder setting:
 *
 *   Dead tile    a blank tile shuffled into the deck. It has no letter, so
 *                it can't go in a word; it just takes a hand slot until it
 *                is mulliganed away (and it comes back when the discard is
 *                reshuffled).
 *   Doubled      a second copy of a few less useful consonants (J, V, W,
 *   consonants   K ...). More copies of weak letters crowd out good ones.
 *
 * Where they come from:
 *   - events (cuddle-expanded-stages.js): "deadTile" / "doubleConsonants"
 *     effects, for the rest of the run;
 *   - the Word Duel: taking a dead tile is one way to pay for Easy;
 *   - some bosses on Hard, for that fight only (HARD_BOSS below);
 *   - Ascension 9, Dead Weight: one dead tile all run.
 *
 * Run-long burdens live on state.umtBurden = { dead, doubles: [letters] }.
 * They are dealt into the deck each stage by _prepareInitialHand, so the
 * Duel's cloned hand gets them too.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleBurdens) return;
  var proto = Game.prototype;
  proto.__cuddleBurdens = true;

  var DEAD_GLYPH = "·";
  // Doubled from the less useful half of the alphabet: a second S or T
  // would be a gift.
  var WEAK = ["J", "Q", "X", "Z", "V", "K", "W", "F", "B", "P", "G", "Y", "H", "M"];
  var DOUBLES_PER_PICK = 3;

  // Bosses that bring a burden of their own on Hard, for the fight only.
  var HARD_BOSS = Object.freeze({
    noMulligans: { dead: 1 },
    quickMode: { dead: 1 },
    fakeFeedback: { dead: 1 },
    countOnly: { doubles: DOUBLES_PER_PICK },
    hiddenMargins: { doubles: DOUBLES_PER_PICK },
    blueMode: { doubles: DOUBLES_PER_PICK }
  });

  function isDeadCard(card) {
    return Boolean(card && (card.dead || card.glyph === DEAD_GLYPH));
  }

  function isDeadGlyph(glyph) {
    return glyph === DEAD_GLYPH;
  }

  function burden(state) {
    if (!state) return { dead: 0, doubles: [] };
    var value = state.umtBurden;
    if (!value || typeof value !== "object") value = state.umtBurden = { dead: 0, doubles: [] };
    value.dead = Math.max(0, Math.floor(Number(value.dead) || 0));
    if (!Array.isArray(value.doubles)) value.doubles = [];
    return value;
  }

  function randomOf(game) {
    return game && typeof game.random === "function" ? game.random : Math.random;
  }

  function shuffle(list, random) {
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var held = list[i]; list[i] = list[j]; list[j] = held;
    }
    return list;
  }

  function difficultyOf(state) {
    return String(state && (state.megaState && state.megaState.difficulty || state.mega && state.mega.difficulty) || "");
  }

  function hardBossBurden(game) {
    var state = game && game.state;
    if (!state || !state.boss || difficultyOf(state) !== "hard") return null;
    return HARD_BOSS[state.boss.id] || null;
  }

  function ascensionDead(game) {
    var ascension = window.CuddleAscension;
    return ascension && typeof ascension.has === "function" && ascension.has(game, "deadWeight") ? 1 : 0;
  }

  // Letters that can be doubled right now: in the deck's alphabet, not
  // removed, not already doubled.
  function doubleCandidates(game, taken) {
    var state = game.state || {};
    var removed = new Set(state.removedLetters || []);
    var skip = new Set(taken || []);
    return WEAK.filter(function open(letter) { return !removed.has(letter) && !skip.has(letter); });
  }

  // -- adding burdens (events, the Duel) ------------------------------------
  function addDead(game, count) {
    var value = burden(game && game.state);
    var n = Math.max(1, Math.floor(Number(count) || 1));
    value.dead += n;
    return n === 1
      ? "A dead tile joins your deck for the rest of the run."
      : n + " dead tiles join your deck for the rest of the run.";
  }

  function addDoubles(game, count) {
    var value = burden(game && game.state);
    var n = Math.max(1, Math.floor(Number(count) || DOUBLES_PER_PICK));
    var picked = shuffle(doubleCandidates(game, value.doubles), randomOf(game)).slice(0, n);
    value.doubles = value.doubles.concat(picked);
    return picked.length
      ? "Doubled consonants: " + picked.join(", ") + " now have two copies in your deck."
      : "Your deck can't hold any more doubled consonants.";
  }

  // -- dealing them in -----------------------------------------------------
  function extrasFor(game) {
    var value = burden(game.state);
    var dead = value.dead + ascensionDead(game);
    var doubles = value.doubles.slice();
    var boss = hardBossBurden(game);
    if (boss && boss.dead) dead += boss.dead;
    if (boss && boss.doubles) {
      // Fixed per fight (stored on the boss), so a reload deals the same.
      var state = game.state;
      if (!Array.isArray(state.boss.umtDoubles)) {
        state.boss.umtDoubles = shuffle(doubleCandidates(game, doubles), randomOf(game)).slice(0, boss.doubles);
      }
      doubles = doubles.concat(state.boss.umtDoubles);
    }
    return { dead: dead, doubles: doubles };
  }

  var basePrepare = proto._prepareInitialHand;
  proto._prepareInitialHand = function prepareInitialHandWithBurdens() {
    var result = basePrepare.apply(this, arguments);
    try {
      var extras = extrasFor(this);
      if (!extras.dead && !extras.doubles.length) return result;
      var state = this.state;
      var game = this;
      var deckGlyphs = new Set(this._baseDeckGlyphs());
      var infinite = state.hand.filter(function keep(card) { return game.isInfiniteCard(card); });
      var finite = state.hand.filter(function drop(card) { return !game.isInfiniteCard(card); }).concat(state.deck);
      for (var i = 0; i < extras.dead; i += 1) {
        finite.push({ id: this._nextId("dead"), glyph: DEAD_GLYPH, source: "deck", dead: true });
      }
      extras.doubles.forEach(function addCopy(letter) {
        if (!deckGlyphs.has(letter) || game.isInfiniteGlyph(letter)) return;
        finite.push(game._newCard(letter, "deck"));
      });
      shuffle(finite, randomOf(this));
      state.hand = infinite;
      state.deck = [];
      finite.forEach(function deal(card) {
        if (game.getCountedHandSize() < game.getHandLimit()) state.hand.push(card);
        else state.deck.push(card);
      });
    } catch (error) {
      console.warn("Cuddle burdens: dealing failed.", error);
    }
    return result;
  };

  // A dead tile can't be played.
  var DEAD_ERROR = "A dead tile has no letter. Mulligan it away.";
  ["toggleDraft", "insertDraftCardAt"].forEach(function guard(name) {
    var base = proto[name];
    if (typeof base !== "function") return;
    proto[name] = function draftWithoutDeadTiles(cardId) {
      var card = typeof this.getHandCard === "function" ? this.getHandCard(cardId) : null;
      if (isDeadCard(card)) return { ok: false, error: DEAD_ERROR };
      return base.apply(this, arguments);
    };
  });

  // -- boss cards: say what Hard adds ----------------------------------------
  function hardNote(id) {
    var entry = HARD_BOSS[id];
    if (!entry) return "";
    return entry.dead
      ? "On Hard: +" + entry.dead + " dead tile in your deck for this fight."
      : "On Hard: " + entry.doubles + " doubled consonants in your deck for this fight.";
  }

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function decorate() {
    var game = activeGame();
    if (!game || !game.state || difficultyOf(game.state) !== "hard") return;
    var cards = document.querySelectorAll(".cuddle-boss-choice[data-boss-id]");
    for (var i = 0; i < cards.length; i += 1) {
      var card = cards[i];
      if (card.querySelector(".umt-burden-note")) continue;
      var note = hardNote(card.getAttribute("data-boss-id"));
      if (!note) continue;
      var line = document.createElement("span");
      line.className = "umt-burden-note";
      line.textContent = note;
      var small = card.querySelector("small");
      if (small) small.insertAdjacentElement("afterend", line);
      else card.appendChild(line);
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function run() {
      pending = false;
      decorate();
    });
  }

  function attach() {
    var host = document.getElementById("cuddleScreen") || document.body;
    if (!host) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    new MutationObserver(schedule).observe(host, { childList: true, subtree: true });
    schedule();
  }
  attach();

  window.CuddleBurdens = Object.freeze({
    DEAD_GLYPH: DEAD_GLYPH,
    HARD_BOSS: HARD_BOSS,
    isDeadCard: isDeadCard,
    isDeadGlyph: isDeadGlyph,
    addDead: addDead,
    addDoubles: addDoubles,
    burden: function read(game) { return burden(game && game.state); },
    hardNote: hardNote
  });
}());
