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
 *   - Ascension 3, Dead Weight: one dead tile all run.
 *
 * The shop's Mend shelf (cuddle-shop.js) sells their removal.
 *
 * Two more tiles ride the same path:
 *   - the Murky Swamp (a World 2 theme, cuddle-worlds.js) sinks 3 dead
 *     tiles into the deck in each of its stages;
 *   - Lucky tiles (the Lucky Clover power): a clover, no letter. Like a
 *     dead tile it can't be played, only mulliganed -- but each one still
 *     in your hand when you solve pays 10/20/30 points (by power level).
 *
 * And three helpful tiles from powers, dealt the same way each stage:
 *   - Idea tiles (Idea Tiles, rare): mulligan one away and the answer
 *     shows one of its letters as a yellow (in the word, place unknown).
 *   - Wave tiles (Wave Tiles, common): never dealt in the opening hand;
 *     when one is drawn, every consonant in your hand is swapped out for
 *     fresh ones.
 *   - Joker tiles (Joker Cache): the cache's Jokers are shuffled into the
 *     deck instead of handed out at the stage start; drawing one gives
 *     you a Joker.
 * Full Circle (epic) pays for going through the deck: each time it runs
 * out and the discard is shuffled back in, one letter of the answer is
 * shown in its exact place (a green hint).
 * A lucky tile mulliganed away pays +5 points. Idea, lucky, wave and Joker
 * tiles that have done their thing leave the deck for the rest of the stage.
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
  var LUCKY_GLYPH = "♣";
  var SWAMP_DEAD = 3;
  var LUCKY_POINTS = [0, 10, 20, 40];
  // Tiles dealt by level: 1, 2, then 4 (the third pick is the big one).
  var TILES_BY_LEVEL = [0, 1, 2, 4];
  var LUCKY_MULLIGAN_POINTS = 5;
  var IDEA_GLYPH = "◇";
  var WAVE_GLYPH = "≈";
  var JOKER_TILE_GLYPH = "◆";
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

  // A dead tile's face: a small, round, friendly skull.
  var SKULL_SVG = '<svg class="umt-dead-skull" viewBox="0 0 40 40" aria-hidden="true" focusable="false">'
    + '<path d="M20 5.5c-8 0-14 5.5-14 12.8 0 4.3 2.1 7.5 4.9 9.3v3.5a2.2 2.2 0 0 0 2.2 2.2h13.8a2.2 2.2 0 0 0 2.2-2.2v-3.5c2.8-1.8 4.9-5 4.9-9.3C34 11 28 5.5 20 5.5z" fill="#efeaf7" stroke="#2b2238" stroke-width="2.4" stroke-linejoin="round"/>'
    + '<ellipse cx="9.8" cy="24.4" rx="2.3" ry="1.4" fill="#f4a7c0" opacity="0.85"/>'
    + '<ellipse cx="30.2" cy="24.4" rx="2.3" ry="1.4" fill="#f4a7c0" opacity="0.85"/>'
    + '<ellipse cx="14.2" cy="19" rx="3.7" ry="4.2" fill="#2b2238"/>'
    + '<ellipse cx="25.8" cy="19" rx="3.7" ry="4.2" fill="#2b2238"/>'
    + '<circle cx="15.4" cy="17.4" r="1.2" fill="#ffffff"/>'
    + '<circle cx="27" cy="17.4" r="1.2" fill="#ffffff"/>'
    + '<path d="M20 23.4l-1.9 2.9h3.8z" fill="#2b2238" stroke="#2b2238" stroke-width="0.8" stroke-linejoin="round"/>'
    + '<path d="M16.8 29.6v3.2M20 29.6v3.2M23.2 29.6v3.2" stroke="#2b2238" stroke-width="1.8" stroke-linecap="round"/>'
    + '</svg>';

  function skullSvg() {
    return SKULL_SVG;
  }

  // A lucky tile's face: a four-leaf clover.
  var LEAF = "M20 19.5C14.6 16 13.6 9.6 17 9.1c1.5-.2 2.7 1 3 2.2.3-1.2 1.5-2.4 3-2.2 3.4.5 2.4 6.9-3 10.4z";
  var CLOVER_SVG = '<svg class="umt-lucky-clover" viewBox="0 0 40 40" aria-hidden="true" focusable="false">'
    + '<path d="M20 28q2.4 5 6.4 7.4" fill="none" stroke="#2f6b1f" stroke-width="2.4" stroke-linecap="round"/>'
    + '<g fill="#4fbf4a" stroke="#2f6b1f" stroke-width="1.7" stroke-linejoin="round" transform="translate(0 0)">'
    + [0, 90, 180, 270].map(function leaf(angle) {
      return '<path d="' + LEAF + '"' + (angle ? ' transform="rotate(' + angle + ' 20 19.5)"' : "") + "/>";
    }).join("")
    + "</g>"
    + '<circle cx="20" cy="19.5" r="1.7" fill="#ffd54a" stroke="#2f6b1f" stroke-width="1"/>'
    + '<path d="M16.4 11.4c.8-.7 1.8-.6 2.2.2" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>'
    + "</svg>";

  function cloverSvg() {
    return CLOVER_SVG;
  }

  function isLuckyCard(card) {
    return Boolean(card && (card.lucky || card.glyph === LUCKY_GLYPH));
  }

  function isLuckyGlyph(glyph) {
    return glyph === LUCKY_GLYPH;
  }

  // An idea tile's face: a little glowing light bulb.
  var BULB_SVG = '<svg class="umt-idea-bulb" viewBox="0 0 40 40" aria-hidden="true" focusable="false">'
    + '<path d="M20 4.5c-6.4 0-11 4.8-11 10.8 0 3.9 1.9 6.4 3.9 8.4 1.3 1.3 2 2.7 2 4.3v1.2h10.2V28c0-1.6.7-3 2-4.3 2-2 3.9-4.5 3.9-8.4C31 9.3 26.4 4.5 20 4.5z" fill="#ffe27a" stroke="#7a5a12" stroke-width="2.2" stroke-linejoin="round"/>'
    + '<path d="M16.2 21.5c1.4-2.4 2.4-2.4 3.8 0 1.4-2.4 2.4-2.4 3.8 0" fill="none" stroke="#c98a12" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<rect x="15" y="29.2" width="10" height="3.4" rx="1.5" fill="#9aa3b5" stroke="#4b5366" stroke-width="1.4"/>'
    + '<rect x="16" y="32.6" width="8" height="3" rx="1.4" fill="#9aa3b5" stroke="#4b5366" stroke-width="1.4"/>'
    + '<path d="M14.4 10.6c1.2-1.7 2.9-2.6 4.6-2.8" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>'
    + "</svg>";

  function bulbSvg() {
    return BULB_SVG;
  }

  function isIdeaCard(card) {
    return Boolean(card && (card.idea || card.glyph === IDEA_GLYPH));
  }

  function isIdeaGlyph(glyph) {
    return glyph === IDEA_GLYPH;
  }

  function isWaveCard(card) {
    return Boolean(card && (card.wave || card.glyph === WAVE_GLYPH));
  }

  function isJokerTile(card) {
    return Boolean(card && (card.jokerTile || card.glyph === JOKER_TILE_GLYPH));
  }

  // Tiles with no letter. None of them can go in a word.
  function isBlankCard(card) {
    return isDeadCard(card) || isLuckyCard(card) || isIdeaCard(card) || isWaveCard(card) || isJokerTile(card);
  }

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

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  // The Murky Swamp: every stage of it sinks 3 dead tiles into the deck.
  function swampDead(game) {
    var worlds = window.CuddleWorlds;
    if (!worlds || !game || !game.state || !game.state.runId || inDuel(game.state)) return 0;
    try {
      var world = worlds.currentWorld(game);
      return world && world.theme === "swamp" ? SWAMP_DEAD : 0;
    } catch (_error) {
      return 0;
    }
  }

  function powerLevel(game, id, max) {
    var registry = window.CuddleSkillTree;
    var node = registry && typeof registry.findNode === "function" ? registry.findNode(id) : null;
    if (!node || !game) return 0;
    try {
      return Math.max(0, Math.min(max || 3, Math.floor(Number(registry.level(game, node)) || 0)));
    } catch (_error) {
      return 0;
    }
  }

  function luckyLevel(game) {
    return powerLevel(game, "luckyClover");
  }

  function luckyCount(game) {
    return TILES_BY_LEVEL[luckyLevel(game)];
  }

  // Joker Cache's Jokers, now dealt as deck tiles: 1, 2, then 4 for
  // Small, two more for Large. The engine's stage-start grant leaves these out
  // (see _deckJokerCount, read in cuddle-engine.js).
  function deckJokers(game) {
    return TILES_BY_LEVEL[powerLevel(game, "jokerCache")] + 2 * powerLevel(game, "jokerCacheLarge", 1);
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

  // -- removing them (the shop's Mend shelf, cuddle-shop.js) ----------------
  // Only run-long burdens: a Hard boss's and Ascension 3's stay put.
  function removeDead(game) {
    var value = burden(game && game.state);
    if (value.dead <= 0) return "";
    value.dead -= 1;
    return value.dead
      ? "A dead tile is gone. " + value.dead + " left in your deck."
      : "Your last dead tile is gone.";
  }

  function removeDoubles(game) {
    var value = burden(game && game.state);
    var letters = value.doubles.slice();
    value.doubles = [];
    return letters.length ? letters.join(", ") + " are back to one copy each." : "";
  }

  // -- dealing them in -----------------------------------------------------
  function extrasFor(game) {
    var value = burden(game.state);
    var dead = value.dead + ascensionDead(game) + swampDead(game);
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
    // Lucky tiles pay on a solve, which a Duel doesn't have; the Duel keeps
    // its own simpler hand (Jokers handed out up front, no power tiles).
    var duel = inDuel(game.state);
    return {
      dead: dead,
      doubles: doubles,
      lucky: duel ? 0 : luckyCount(game),
      idea: duel ? 0 : TILES_BY_LEVEL[powerLevel(game, "ideaTiles")],
      wave: duel ? 0 : TILES_BY_LEVEL[powerLevel(game, "waveTiles")],
      jokers: duel ? 0 : deckJokers(game)
    };
  }

  var basePrepare = proto._prepareInitialHand;
  proto._prepareInitialHand = function prepareInitialHandWithBurdens() {
    var result = basePrepare.apply(this, arguments);
    try {
      var extras = extrasFor(this);
      if (!extras.dead && !extras.doubles.length && !extras.lucky && !extras.idea && !extras.wave && !extras.jokers) return result;
      var state = this.state;
      var game = this;
      var deckGlyphs = new Set(this._baseDeckGlyphs());
      var infinite = state.hand.filter(function keep(card) { return game.isInfiniteCard(card); });
      var finite = state.hand.filter(function drop(card) { return !game.isInfiniteCard(card); }).concat(state.deck);
      for (var i = 0; i < extras.dead; i += 1) {
        finite.push({ id: this._nextId("dead"), glyph: DEAD_GLYPH, source: "deck", dead: true });
      }
      for (var j = 0; j < extras.lucky; j += 1) {
        finite.push({ id: this._nextId("lucky"), glyph: LUCKY_GLYPH, source: "deck", lucky: true });
      }
      for (var k = 0; k < extras.idea; k += 1) {
        finite.push({ id: this._nextId("idea"), glyph: IDEA_GLYPH, source: "deck", idea: true });
      }
      for (var m = 0; m < extras.jokers; m += 1) {
        finite.push({ id: this._nextId("jokertile"), glyph: JOKER_TILE_GLYPH, source: "deck", jokerTile: true });
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
      // Wave tiles wait in the deck: a wave in the opening hand would only
      // reshuffle a hand you haven't seen yet. The deck is drawn from its
      // end, so they go in at random depths.
      for (var w = 0; w < extras.wave; w += 1) {
        var at = Math.floor(randomOf(this)() * (state.deck.length + 1));
        state.deck.splice(at, 0, { id: this._nextId("wave"), glyph: WAVE_GLYPH, source: "deck", wave: true });
      }
      // A Joker tile dealt straight into the opening hand is a Joker now.
      state.hand.filter(isJokerTile).forEach(function open(card) { cashJokerTile(game, card, true); });
    } catch (error) {
      console.warn("Cuddle burdens: dealing failed.", error);
    }
    return result;
  };

  // -- power tiles in play -----------------------------------------------------
  function note(game, text) {
    game.state.lastMessage = ((game.state.lastMessage || "") + " " + text).trim();
  }

  // Things a draw sets off are told after the action that drew (a
  // mulligan or a guess writes its own message over anything said sooner).
  function drawNote(game, text) {
    game.__umtDrawNotes = (game.__umtDrawNotes || []).concat([text]);
  }

  function flushDrawNotes(game) {
    var notes = game.__umtDrawNotes || [];
    game.__umtDrawNotes = [];
    if (notes.length && game.state) note(game, notes.join(" "));
  }

  ["mulligan", "submitDraft", "chooseQuestReward", "_beginRound"].forEach(function tell(name) {
    var base = proto[name];
    if (typeof base !== "function") return;
    proto[name] = function thenTellDraws() {
      var result = base.apply(this, arguments);
      flushDrawNotes(this);
      return result;
    };
  });

  function removeFromHand(state, card) {
    var index = state.hand.indexOf(card);
    if (index !== -1) state.hand.splice(index, 1);
    state.draft = (state.draft || []).filter(function keep(id) { return id !== card.id; });
  }

  // Drawing a Joker tile: it becomes a Joker. One Joker card sits in hand
  // at a time; any more wait as charges (the engine's own rule).
  function cashJokerTile(game, card, quiet) {
    var state = game.state;
    removeFromHand(state, card);
    var mega = state.megaState || (state.megaState = {});
    mega.jokerCharges = Math.max(0, Number(mega.jokerCharges) || 0) + 1;
    var glyph = Engine.CUDDLE_JOKER_GLYPH;
    var holding = state.hand.some(function joker(item) { return item.source === "joker" && item.glyph === glyph; });
    if (!holding && glyph) {
      mega.jokerCharges -= 1;
      state.hand.push({ id: game._nextId("joker"), glyph: glyph, source: "joker" });
    }
    if (!quiet) drawNote(game, "Joker tile: +1 Joker.");
  }

  // Draws stop on power tiles: a Joker tile turns into a Joker, a wave is
  // queued (it fires once the draw that found it is finished), and the
  // draw goes on so the hand still fills.
  var baseDrawOne = proto._drawOne;
  proto._drawOne = function drawOneWithPowerTiles() {
    for (var guard = 0; guard < 60; guard += 1) {
      var discardBefore = (this.state.discard || []).length;
      var card = baseDrawOne.apply(this, arguments);
      // The discard only ever empties here by being shuffled back in.
      if (discardBefore > 0 && !(this.state.discard || []).length && !inDuel(this.state)) {
        if (powerLevel(this, "fullCircle", 1) > 0) this.__umtCycles = (this.__umtCycles || 0) + 1;
        // Riptide (Wave Tiles + Full Circle): +2 mulligans a reshuffle.
        var synergies = window.CuddleSynergies;
        if (synergies && typeof synergies.owns === "function" && synergies.owns(this, "riptide")) {
          var gained = typeof this.mulliganGain === "function" ? this.mulliganGain(2) : 2;
          this.state.mulligansLeft = Math.max(0, Number(this.state.mulligansLeft) || 0) + gained;
          drawNote(this, "Riptide: +" + gained + " mulligans.");
        }
      }
      if (!card || inDuel(this.state)) return card;
      if (isJokerTile(card)) {
        cashJokerTile(this, card, false);
        continue;
      }
      if (isWaveCard(card)) {
        removeFromHand(this.state, card);
        this.__umtWaves = (this.__umtWaves || 0) + 1;
        continue;
      }
      return card;
    }
    return null;
  };

  // A wave: every letter tile in hand (not vowels or letters you already
  // know, which stay) goes to the discard, and fresh ones are drawn.
  function flushWaves(game) {
    var rounds = 0;
    while (game.__umtWaves > 0 && rounds < 6) {
      rounds += 1;
      game.__umtWaves -= 1;
      var state = game.state;
      if (!state || state.status !== "playing") { game.__umtWaves = 0; break; }
      var drafted = new Set(state.draft || []);
      var swept = state.hand.filter(function consonant(card) {
        return /^[A-Z]$/.test(card.glyph) && !game.isVowelGlyph(card.glyph) && !game.isInfiniteCard(card)
          && card.source !== "joker" && !drafted.has(card.id);
      });
      if (swept.length) game._discardCards(swept.map(function id(card) { return card.id; }));
      var drawn = game.drawToHandLimit();
      drawNote(game, "Wave! " + swept.length + " consonant" + (swept.length === 1 ? "" : "s") + " washed out, " + drawn.length + " new ones drawn.");
    }
    game.__umtWaves = 0;
  }

  // Full Circle: a green hint per trip through the deck.
  function flushCycles(game) {
    var rounds = 0;
    while (game.__umtCycles > 0 && rounds < 4) {
      rounds += 1;
      game.__umtCycles -= 1;
      if (!game.state || game.state.status !== "playing" || typeof game._revealPositionPeek !== "function") break;
      drawNote(game, "Full Circle: " + game._revealPositionPeek());
    }
    game.__umtCycles = 0;
  }

  var flushing = false;
  ["drawCards", "_drawRewardCards"].forEach(function wrapDraw(name) {
    var base = proto[name];
    if (typeof base !== "function") return;
    proto[name] = function drawThenWave() {
      var result = base.apply(this, arguments);
      if (!flushing && (this.__umtWaves > 0 || this.__umtCycles > 0)) {
        flushing = true;
        try {
          for (var pass = 0; pass < 4 && (this.__umtWaves > 0 || this.__umtCycles > 0); pass += 1) {
            flushWaves(this);
            flushCycles(this);
          }
        } finally {
          flushing = false;
        }
      }
      return result;
    };
  });

  // A yellow hint: one letter of the answer you haven't found yet, marked
  // as in the word (place unknown). It stays in hand from now on.
  function yellowHint(game) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    var open = Array.from(new Set(secret.split(""))).filter(function unknown(letter) {
      var status = game.getCardKnowledgeStatus(letter);
      return status !== "green" && status !== "yellow";
    });
    if (!open.length) return "";
    var letter = open[Math.floor(randomOf(game)() * open.length)];
    state.knownPresent = Array.from(new Set((state.knownPresent || []).concat([letter]))).sort();
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
    return letter;
  }

  // Mulligans: idea tiles give a yellow hint each, lucky tiles +5 points
  // each; both are spent.
  var baseMulligan = proto.mulligan;
  proto.mulligan = function mulliganWithPowerTiles(cardIds) {
    var state = this.state;
    var game = this;
    var picked = (cardIds || []).map(function find(id) { return game.getHandCard(id); }).filter(Boolean);
    var ideas = picked.filter(isIdeaCard);
    var lucky = picked.filter(isLuckyCard);
    var result = baseMulligan.apply(this, arguments);
    state = this.state;
    if (!result || !result.ok || inDuel(state) || (!ideas.length && !lucky.length)) return result;
    try {
      var spent = new Set(ideas.concat(lucky).map(function id(card) { return card.id; }));
      state.discard = (state.discard || []).filter(function keep(card) { return !spent.has(card.id); });
      if (lucky.length) {
        var points = lucky.length * LUCKY_MULLIGAN_POINTS;
        stageBonus(this, points, "umtLuckyMulligan", "Lucky tiles mulliganed");
        note(this, "Lucky tile" + (lucky.length === 1 ? "" : "s") + " mulliganed: +" + points + " points.");
      }
      if (ideas.length) {
        var letters = [];
        ideas.forEach(function hint() {
          var letter = yellowHint(game);
          if (letter) letters.push(letter);
        });
        if (letters.length) {
          this.drawToHandLimit();
          note(this, "Idea! " + letters.join(", ") + (letters.length === 1 ? " is" : " are") + " in the answer.");
        } else {
          note(this, "Idea: you already know every letter of the answer.");
        }
      }
      if (typeof this.save === "function") this.save();
    } catch (error) {
      console.warn("Cuddle burdens: a power tile failed on a mulligan.", error);
    }
    return result;
  };

  // The engine's stage-start Joker grant skips the ones dealt as tiles.
  // (Only the cache's own share of the per-stage grant -- one a Small
  // level, two for Large -- whatever count of tiles that buys.)
  proto._deckJokerCount = function deckJokerCount() {
    return inDuel(this.state) ? 0 : powerLevel(this, "jokerCache") + 2 * powerLevel(this, "jokerCacheLarge", 1);
  };

  // A dead or lucky tile can't be played.
  var DEAD_ERROR = "A dead tile has no letter. Mulligan it away.";
  var LUCKY_ERROR = "A lucky tile has no letter. Keep it in hand: it pays out when you solve.";
  var IDEA_ERROR = "An idea tile has no letter. Mulligan it away for a yellow hint.";
  ["toggleDraft", "insertDraftCardAt"].forEach(function guard(name) {
    var base = proto[name];
    if (typeof base !== "function") return;
    proto[name] = function draftWithoutBlankTiles(cardId) {
      var card = typeof this.getHandCard === "function" ? this.getHandCard(cardId) : null;
      if (isDeadCard(card)) return { ok: false, error: DEAD_ERROR };
      if (isLuckyCard(card)) return { ok: false, error: LUCKY_ERROR };
      if (isIdeaCard(card)) return { ok: false, error: IDEA_ERROR };
      return base.apply(this, arguments);
    };
  });

  // -- lucky tiles pay out on a solve ----------------------------------------
  function stageBonus(game, amount, field, label) {
    var rebalance = window.CuddleRebalanceV5;
    if (rebalance && typeof rebalance.addStageBonus === "function") {
      rebalance.addStageBonus(game, amount, field, label);
      return;
    }
    game.state.score = (Number(game.state.score) || 0) + amount;
    game.state.roundScore = (Number(game.state.roundScore) || 0) + amount;
  }

  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithLuckyTiles() {
    var state = this.state;
    var before = state && Array.isArray(state.history) ? state.history.length : 0;
    var result = baseSubmit.apply(this, arguments);
    state = this.state;
    var history = state && Array.isArray(state.history) ? state.history : [];
    if (!result || !result.ok || history.length <= before || inDuel(state)) return result;
    try {
      var entry = history[history.length - 1];
      var solved = Boolean(entry && state.secret && entry.word === state.secret);
      var level = luckyLevel(this);
      if (!solved || level <= 0) return result;
      var held = (state.hand || []).filter(isLuckyCard).length;
      if (!held) return result;
      var points = held * LUCKY_POINTS[level];
      stageBonus(this, points, "umtLuckyClover", held === 1 ? "Lucky tile" : "Lucky tiles x" + held);
      state.lastMessage = ((state.lastMessage || "") + " Lucky Clover: +" + points + " points.").trim();
    } catch (error) {
      console.warn("Cuddle burdens: lucky tiles failed to pay.", error);
    }
    return result;
  };

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
    LUCKY_GLYPH: LUCKY_GLYPH,
    LUCKY_POINTS: LUCKY_POINTS,
    SWAMP_DEAD: SWAMP_DEAD,
    HARD_BOSS: HARD_BOSS,
    isDeadCard: isDeadCard,
    isDeadGlyph: isDeadGlyph,
    skullSvg: skullSvg,
    cloverSvg: cloverSvg,
    bulbSvg: bulbSvg,
    IDEA_GLYPH: IDEA_GLYPH,
    WAVE_GLYPH: WAVE_GLYPH,
    JOKER_TILE_GLYPH: JOKER_TILE_GLYPH,
    LUCKY_MULLIGAN_POINTS: LUCKY_MULLIGAN_POINTS,
    isIdeaCard: isIdeaCard,
    isIdeaGlyph: isIdeaGlyph,
    isWaveCard: isWaveCard,
    isJokerTile: isJokerTile,
    isLuckyCard: isLuckyCard,
    isLuckyGlyph: isLuckyGlyph,
    isBlankCard: isBlankCard,
    luckyLevel: luckyLevel,
    addDead: addDead,
    addDoubles: addDoubles,
    removeDead: removeDead,
    removeDoubles: removeDoubles,
    burden: function read(game) { return burden(game && game.state); },
    hardNote: hardNote
  });
}());
