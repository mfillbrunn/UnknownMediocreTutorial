/* Cuddle: dead cards and doubled consonants.
 *
 * Two deck burdens a run can pick up, as the price of a bargain or a
 * harder setting:
 *
 *   Dead card    a blank tile shuffled into the deck. It has no letter, so
 *                it can't go in a word; it just takes a hand slot until it
 *                is mulliganed away (and it comes back when the discard is
 *                reshuffled).
 *   Doubled      a second copy of a few less useful consonants (J, V, W,
 *   consonants   K ...). More copies of weak letters crowd out good ones.
 *
 * Where they come from:
 *   - events (cuddle-expanded-stages.js): "deadTile" / "doubleConsonants"
 *     effects, for the rest of the run;
 *   - the Word Duel: taking a dead card is one way to pay for Easy;
 *   - some bosses on Hard, for that fight only (HARD_BOSS below);
 *   - Ascension 3, Dead Weight: one dead card all run.
 *
 * The shop's Mend shelf (cuddle-shop.js) sells their removal.
 *
 * Two more tiles ride the same path:
 *   - the Murky Swamp (a World 2 theme, cuddle-worlds.js) sinks 3 dead
 *     tiles into the deck in each of its stages;
 *   - Lucky cards (the Lucky Clover power): a clover, no letter. Like a
 *     dead card it can't be played, only mulliganed -- but each one still
 *     in your hand when you solve pays 5/10/20 points (by power level).
 *
 * And three helpful tiles from powers, dealt the same way each stage:
 *   - Idea cards (Idea Cards, rare): mulligan one away and the answer
 *     shows one of its letters as a yellow (in the word, place unknown).
 *   - Wave cards (Wave Cards, common): never dealt in the opening hand;
 *     when one is drawn, every consonant in your hand is swapped out for
 *     fresh ones; dead cards wash out too, and idea cards give their hint.
 *   - Joker cards (Joker Cache): the cache's Jokers are shuffled into the
 *     deck instead of handed out at the stage start; drawing one gives
 *     you a Joker.
 * Full Circle (epic) pays for going through the deck: the first time in a
 * stage it runs out and the discard is shuffled back in, one letter of
 * the answer is shown in its exact place (a green hint).
 * A lucky card mulliganed away pays +2 points. Idea, lucky, wave and Joker
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
  var LUCKY_POINTS = [0, 5, 10, 20];
  // Tiles dealt by level: 1, 2, then 4 (the third pick is the big one).
  var TILES_BY_LEVEL = [0, 1, 2, 4];
  var LUCKY_MULLIGAN_POINTS = 2;
  var IDEA_GLYPH = "◇";
  var WAVE_GLYPH = "≈";
  var JOKER_TILE_GLYPH = "◆";
  // Doubled from the less useful half of the alphabet: a second S or T
  // would be a gift.
  var WEAK = ["J", "Q", "X", "Z", "V", "K", "W", "F", "B", "P", "G", "Y", "H", "M"];
  var DOUBLES_PER_PICK = 3;

  // Bosses that bring a burden of their own on Hard, for the fight only.
  // Every boss has one, so both cards on a boss choice show what Hard adds.
  var HARD_BOSS = Object.freeze({
    noMulligans: { dead: 1 },
    quickMode: { dead: 1 },
    fakeFeedback: { dead: 1 },
    shortHand: { dead: 1 },
    presetWordsTrial: { dead: 1 },
    questEndurance: { dead: 1 },
    countOnly: { doubles: DOUBLES_PER_PICK },
    hiddenMargins: { doubles: DOUBLES_PER_PICK },
    blueMode: { doubles: DOUBLES_PER_PICK },
    delayedFeedback: { doubles: DOUBLES_PER_PICK },
    hideFeedback: { doubles: DOUBLES_PER_PICK },
    arrowMode: { doubles: DOUBLES_PER_PICK }
  });
  // Any other boss (a mixed one like the Chimera): one dead card.
  var HARD_BOSS_DEFAULT = Object.freeze({ dead: 1 });

  function hardBurdenFor(id) {
    return id ? (HARD_BOSS[id] || HARD_BOSS_DEFAULT) : null;
  }

  // A dead card's face: a small, round, friendly skull.
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

  // A lucky card's face: a four-leaf clover.
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

  // An idea card's face: a little glowing light bulb.
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
    return hardBurdenFor(state.boss.id);
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  // The Murky Swamp: every stage of it sinks 3 dead cards into the deck.
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

  // School of Flora: its ranks add tiles and double the lucky payout.
  function schoolPerk(game, name) {
    var schools = window.CuddleSchools;
    try {
      return schools && typeof schools.perk === "function" ? Number(schools.perk(game, name)) || 0 : 0;
    } catch (_error) {
      return 0;
    }
  }

  function luckyCount(game) {
    return TILES_BY_LEVEL[luckyLevel(game)] + schoolPerk(game, "luckyTiles");
  }

  // Joker Cache's Jokers, now dealt as deck tiles: 1, 2, then 4 for
  // Small, two more for Large. The engine's stage-start grant leaves these out
  // (see _deckJokerCount, read in cuddle-engine.js).
  // Small Joker Cache's Joker cards in the deck: 1, 2, then 4. (Large
  // Joker Cache hands a free Joker card out at stage start instead.)
  function deckJokers(game) {
    return TILES_BY_LEVEL[powerLevel(game, "jokerCache")];
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
      ? "A dead card joins your deck for the rest of the run."
      : n + " dead cards join your deck for the rest of the run.";
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
      ? "A dead card is gone. " + value.dead + " left in your deck."
      : "Your last dead card is gone.";
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
    // Lucky cards pay on a solve, which a Duel doesn't have; the Duel keeps
    // its own simpler hand (Jokers handed out up front, no power cards).
    var duel = inDuel(game.state);
    return {
      dead: dead,
      doubles: doubles,
      lucky: duel ? 0 : luckyCount(game),
      // Idea cards stay 1/2/3: four yellow hints a stage was too easy.
      idea: duel ? 0 : powerLevel(game, "ideaTiles") + schoolPerk(game, "ideaTiles"),
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
      // Wave cards wait in the deck: a wave in the opening hand would only
      // reshuffle a hand you haven't seen yet. The deck is drawn from its
      // end, so they go in at random depths.
      for (var w = 0; w < extras.wave; w += 1) {
        var at = Math.floor(randomOf(this)() * (state.deck.length + 1));
        state.deck.splice(at, 0, { id: this._nextId("wave"), glyph: WAVE_GLYPH, source: "deck", wave: true });
      }
      // A Joker card dealt straight into the opening hand is a Joker now.
      state.hand.filter(isJokerTile).forEach(function open(card) { cashJokerTile(game, card, true); });
    } catch (error) {
      console.warn("Cuddle burdens: dealing failed.", error);
    }
    return result;
  };

  // -- Large Joker Cache: a free Joker card at stage start ----------------
  // Every stage starts with a Joker card in your hand, on top of your hand
  // (it doesn't count toward the hand limit). If a Joker card is already
  // there, this one is added to it as one more use.
  var baseBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundWithStartingJoker() {
    var result = baseBeginRound.apply(this, arguments);
    try {
      var state = this.state;
      if (state && state.status === "playing" && !inDuel(state) && powerLevel(this, "jokerCacheLarge", 1) > 0) {
        var key = [state.runId || "", state.round || 0, state.secret || ""].join(":");
        if (state.umtStartJoker !== key) {
          state.umtStartJoker = key;
          var glyph = Engine.CUDDLE_JOKER_GLYPH;
          var held = state.hand.find(function joker(item) { return item.source === "joker" && item.glyph === glyph; });
          if (held) {
            var mega = state.megaState || (state.megaState = {});
            mega.jokerCharges = Math.max(0, Number(mega.jokerCharges) || 0) + 1;
            held.freeJoker = true;
          } else if (glyph) {
            state.hand.push({ id: this._nextId("joker"), glyph: glyph, source: "joker", freeJoker: true });
          }
        }
      }
    } catch (error) {
      console.warn("Cuddle burdens: the starting Joker failed.", error);
    }
    return result;
  };

  // -- power cards in play -----------------------------------------------------
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

  // Drawing a Joker card: it becomes a Joker. One Joker card sits in hand
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
    if (!quiet) drawNote(game, "Joker card: +1 Joker.");
  }

  // Draws stop on power cards: a Joker card turns into a Joker, a wave is
  // queued (it fires once the draw that found it is finished), and the
  // draw goes on so the hand still fills.
  var baseDrawOne = proto._drawOne;
  proto._drawOne = function drawOneWithPowerTiles() {
    for (var guard = 0; guard < 60; guard += 1) {
      var discardBefore = (this.state.discard || []).length;
      var card = baseDrawOne.apply(this, arguments);
      // The discard only ever empties here by being shuffled back in.
      if (discardBefore > 0 && !(this.state.discard || []).length && !inDuel(this.state)) {
        // Full Circle: once a stage (more trips through the deck gave the
        // whole answer away).
        var fullCircleKey = [this.state.runId || "", this.state.round || 0, this.state.secret || ""].join(":");
        if (powerLevel(this, "fullCircle", 1) > 0 && this.state.umtFullCircle !== fullCircleKey) {
          this.state.umtFullCircle = fullCircleKey;
          this.__umtCycles = (this.__umtCycles || 0) + 1;
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

  // A wave: every consonant tile in hand (vowels stay), typed into the
  // word or not, goes to the discard, and fresh ones are drawn. Dead
  // cards wash out too, and idea cards, which give their yellow hint.
  function flushWaves(game) {
    var rounds = 0;
    while (game.__umtWaves > 0 && rounds < 6) {
      rounds += 1;
      game.__umtWaves -= 1;
      var state = game.state;
      if (!state || state.status !== "playing") { game.__umtWaves = 0; break; }
      // Letters already typed into the word wash out with the rest; the
      // word being built is cleared, since it has lost letters anyway.
      var swept = state.hand.filter(function consonant(card) {
        return /^[A-Z]$/.test(card.glyph) && !game.isVowelGlyph(card.glyph) && !game.isInfiniteCard(card)
          && card.source !== "joker";
      });
      if (swept.length) state.draft = [];
      // The wave also carries off dead cards (to the discard, like a
      // mulligan) and idea cards, which give their yellow hint as they go.
      // Jokers and lucky cards are yours to keep: it leaves them be.
      var dead = state.hand.filter(isDeadCard);
      var ideas = state.hand.filter(isIdeaCard);
      var sweptGlyphs = swept.map(function glyph(card) { return card.glyph; });
      if (swept.length || dead.length) game._discardCards(swept.concat(dead).map(function id(card) { return card.id; }));
      var ideaLetters = [];
      if (ideas.length) {
        var spent = new Set(ideas.map(function id(card) { return card.id; }));
        state.hand = state.hand.filter(function keep(card) { return !spent.has(card.id); });
        ideas.forEach(function hint() {
          var letter = yellowHint(game);
          if (letter) ideaLetters.push(letter);
        });
      }
      var hadLucky = state.hand.some(isLuckyCard);
      var hadJoker = state.hand.some(isJokerTile);
      var drawn = game.drawToHandLimit();
      drawn = Array.isArray(drawn) ? drawn : [];
      // For the hand: the wave card shows up, a wave washes these letters
      // (and dead and idea cards) out, then the new ones come in, special
      // cards it drew among them (playWaveFx below).
      game.__umtWaveFx = (game.__umtWaveFx || []).concat([{
        swept: sweptGlyphs.concat(dead.map(function d() { return "dead"; }), ideas.map(function i() { return "idea"; })),
        newLucky: !hadLucky && drawn.some(isLuckyCard),
        newJoker: !hadJoker && drawn.some(isJokerTile),
        at: Date.now()
      }]);
      // Hide the new cards from their very first frame on screen.
      if (typeof document !== "undefined" && document.body && !reducedMotion()) {
        document.body.classList.add("umt-wave-active");
        document.body.classList.toggle("umt-wave-new-lucky", game.__umtWaveFx[game.__umtWaveFx.length - 1].newLucky);
        document.body.classList.toggle("umt-wave-new-joker", game.__umtWaveFx[game.__umtWaveFx.length - 1].newJoker);
      }
      drawNote(game, "Wave! " + swept.length + " consonant" + (swept.length === 1 ? "" : "s")
        + (dead.length ? " and " + dead.length + " dead card" + (dead.length === 1 ? "" : "s") : "")
        + " washed out, " + drawn.length + " new ones drawn."
        + (ideaLetters.length ? " The idea card" + (ideas.length === 1 ? "" : "s") + " washed out too: " + ideaLetters.join(", ") + (ideaLetters.length === 1 ? " is" : " are") + " in the answer." : ""));
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
      var peekBefore = (game.state.revealedPositions || []).slice();
      var peek = game._revealPositionPeek();
      (game.state.revealedPositions || []).forEach(function named(letter, index) {
        if (letter && !peekBefore[index] && window.CuddleHintFx) window.CuddleHintFx.note(game, letter, "Full Circle");
      });
      drawNote(game, "Full Circle: " + peek);
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
    if (window.CuddleHintFx) window.CuddleHintFx.note(game, letter, "Idea card");
    state.knownPresent = Array.from(new Set((state.knownPresent || []).concat([letter]))).sort();
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
    return letter;
  }

  // Mulligans: idea cards give a yellow hint each, lucky cards +5 points
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
        if (stageBonus(this, points, "umtLuckyMulligan", "Lucky cards mulliganed") > 0) {
          note(this, "Lucky card" + (lucky.length === 1 ? "" : "s") + " mulliganed: +" + points + " points.");
        }
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
      console.warn("Cuddle burdens: a power card failed on a mulligan.", error);
    }
    return result;
  };

  // The engine's stage-start Joker grant skips the caches' share of it
  // (one a Small level, two for Large): Small deals Joker cards into the
  // deck, Large hands out its own free Joker card (below).
  proto._deckJokerCount = function deckJokerCount() {
    return inDuel(this.state) ? 0 : powerLevel(this, "jokerCache") + 2 * powerLevel(this, "jokerCacheLarge", 1);
  };

  // A dead or lucky card can't be played.
  var DEAD_ERROR = "A dead card has no letter. Mulligan it away.";
  var LUCKY_ERROR = "A lucky card has no letter. Keep it in hand: it pays out when you solve.";
  var IDEA_ERROR = "An idea card has no letter. Mulligan it away for a yellow hint.";
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

  // -- lucky cards pay out on a solve ----------------------------------------
  function stageBonus(game, amount, field, label) {
    var rebalance = window.CuddleRebalanceV5;
    if (rebalance && typeof rebalance.addStageBonus === "function") {
      // 0 when refused (a guess past the window earns nothing).
      return Number(rebalance.addStageBonus(game, amount, field, label)) || 0;
    }
    game.state.score = (Number(game.state.score) || 0) + amount;
    game.state.roundScore = (Number(game.state.roundScore) || 0) + amount;
    return amount;
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
      if (!solved) return result;
      var held = (state.hand || []).filter(isLuckyCard).length;
      if (!held) return result;
      // Flora's own lucky card pays the first level's 10 without the badge.
      var points = held * LUCKY_POINTS[Math.max(1, level)] * Math.max(1, schoolPerk(this, "luckyMultiplier"));
      if (stageBonus(this, points, "umtLuckyClover", held === 1 ? "Lucky card" : "Lucky cards x" + held) > 0) {
        state.lastMessage = ((state.lastMessage || "") + " Lucky Clover: +" + points + " points.").trim();
      }
    } catch (error) {
      console.warn("Cuddle burdens: lucky cards failed to pay.", error);
    }
    return result;
  };

  // -- boss cards: say what Hard adds ----------------------------------------
  function hardNote(id) {
    var entry = hardBurdenFor(id);
    if (!entry) return "";
    // Shown on Hard only (decorate below), so it doesn't say "On Hard".
    return entry.dead
      ? "+" + entry.dead + " dead card in your deck for this fight."
      : entry.doubles + " doubled consonants in your deck for this fight.";
  }

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  // Boss texts that name a Hard-only value ("two on Hard", "45 on Hard")
  // show just the value for the difficulty being played.
  var DIFFICULTY_TEXTS = [
    [/One fewer consonant in your hand \(two on Hard\)\./g, "Two fewer consonants in your hand.", "One fewer consonant in your hand."],
    [/\(-1 consonant, -2 on Hard\)/g, "(-2 consonants)", "(-1 consonant)"],
    [/-1 consonant \(-2 on Hard\)/g, "-2 consonants", "-1 consonant"],
    [/60 seconds per guess \(45 on Hard\)/g, "45 seconds per guess", "60 seconds per guess"],
    [/60 seconds \(45 on Hard\)/g, "45 seconds", "60 seconds"]
  ];

  function difficultyText(text, hard) {
    var out = text;
    DIFFICULTY_TEXTS.forEach(function swap(rule) {
      out = out.replace(rule[0], hard ? rule[1] : rule[2]);
    });
    return out;
  }

  function rewriteDifficultyTexts(root, hard) {
    if (!root || !document.createTreeWalker) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue;
      if (!text || text.indexOf("on Hard") === -1) continue;
      var next = difficultyText(text, hard);
      if (next !== text) node.nodeValue = next;
    }
    var titled = root.querySelectorAll ? root.querySelectorAll("[title*='on Hard'], [aria-label*='on Hard']") : [];
    for (var i = 0; i < titled.length; i += 1) {
      ["title", "aria-label"].forEach(function attr(name) {
        var value = titled[i].getAttribute(name);
        if (value && value.indexOf("on Hard") !== -1) titled[i].setAttribute(name, difficultyText(value, hard));
      });
    }
  }

  function decorate() {
    var game = activeGame();
    if (!game || !game.state) return;
    var hard = difficultyOf(game.state) === "hard";
    rewriteDifficultyTexts(document.getElementById("cuddleScreen"), hard);
    if (!hard) return;
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

  // -- the wave, on screen ----------------------------------------------------
  var WAVE_SVG = '<svg class="umt-wave-glyph" viewBox="0 0 40 40" aria-hidden="true" focusable="false">'
    + '<path d="M4 25c4-9 10-13 16-9 3 1.8 3 5.6 0 6.6-2 .7-3.7-.7-3-2.4C21 13 30 12 36 18v14H4z" fill="#4fb3ea" stroke="#1d5b8a" stroke-width="2.2" stroke-linejoin="round"/>'
    + '<path d="M4 31c4-3 8-3 12 0s8 3 12 0 8-3 10-1" fill="none" stroke="#d6f1ff" stroke-width="2" stroke-linecap="round"/>'
    + '<circle cx="31" cy="12" r="1.8" fill="#bfe8ff"/><circle cx="35" cy="16" r="1.3" fill="#bfe8ff"/>'
    + "</svg>";

  var WAVE_MS = { tile: 520, sweep: 900, settle: 380 };
  var waveBusy = false;

  // Consonant cards the wave brought (they're hidden until it has passed).
  var NEW_CARD_SELECTOR = ".cuddle-hand-panel .cuddle-card:not(.is-vowel):not(.is-infinite):not(.is-dead):not(.is-lucky):not(.is-idea):not(.is-joker)";
  // Cards a wave brings in: its new consonants, every dead and idea card
  // (the wave washed out the old ones), and a lucky card or Joker it drew
  // when there wasn't one already (cuddle-burdens.css hides them likewise).
  function freshCards(event) {
    var selector = NEW_CARD_SELECTOR + ", .cuddle-hand-panel .cuddle-card.is-dead, .cuddle-hand-panel .cuddle-card.is-idea"
      + (event && event.newLucky ? ", .cuddle-hand-panel .cuddle-card.is-lucky" : "")
      + (event && event.newJoker ? ", .cuddle-hand-panel .cuddle-card.is-joker" : "");
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function endWave() {
    if (!document.body) return;
    document.body.classList.remove("umt-wave-active", "umt-wave-new-lucky", "umt-wave-new-joker");
  }

  function reducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_error) {
      return false;
    }
  }

  function playWaveFx(game) {
    var queue = game && game.__umtWaveFx;
    if (waveBusy || !Array.isArray(queue) || !queue.length) return;
    var panel = document.querySelector("#cuddleScreen .cuddle-hand-panel");
    var event = queue[0];
    if (!panel) {
      // Not on the play screen (a quest reward, the cash-out): try again
      // shortly, and give up on a wave that's gone stale.
      if (Date.now() - event.at > 4000) {
        queue.shift();
        if (!queue.length) endWave();
      }
      return;
    }
    queue.shift();
    if (reducedMotion() || !document.body) {
      endWave();
      return;
    }
    waveBusy = true;
    document.body.classList.add("umt-wave-active");
    var panelBox = panel.getBoundingClientRect();
    var slots = freshCards(event).map(function box(card) {
      // The deck's fly-in (cuddle-deck-fx.js) is still moving these hidden
      // cards: finish it so they're measured where they'll sit.
      if (typeof card.getAnimations === "function") card.getAnimations().forEach(function end(a) { try { a.finish(); } catch (_e) { a.cancel(); } });
      return card.getBoundingClientRect();
    });
    var layer = document.createElement("div");
    layer.className = "umt-wave-layer";
    layer.setAttribute("aria-hidden", "true");
    // The old letters, sitting where the hand's consonants are.
    var ghosts = event.swept.map(function ghost(glyph, index) {
      var slot = slots[index] || slots[slots.length - 1] || { left: panelBox.left + 20 + index * 46, top: panelBox.top + 60, width: 42, height: 48 };
      var el = document.createElement("span");
      el.className = "umt-wave-ghost" + (glyph === "dead" || glyph === "idea" ? " is-" + glyph : "");
      if (glyph === "dead") el.innerHTML = skullSvg();
      else if (glyph === "idea") el.textContent = "\uD83D\uDCA1";
      else el.textContent = glyph;
      el.style.left = slot.left + "px";
      el.style.top = slot.top + "px";
      el.style.width = slot.width + "px";
      el.style.height = slot.height + "px";
      layer.appendChild(el);
      return { el: el, x: slot.left + slot.width / 2 };
    });
    // The wave card, drawn from the deck.
    var deck = document.querySelector("#cuddleScreen .cuddle-deck");
    var deckBox = deck ? deck.getBoundingClientRect() : { left: panelBox.left + 8, top: panelBox.top + 8, width: 40, height: 52 };
    var tile = document.createElement("span");
    tile.className = "umt-wave-tile";
    tile.innerHTML = WAVE_SVG;
    tile.style.left = deckBox.left + "px";
    tile.style.top = deckBox.top + "px";
    layer.appendChild(tile);
    // The wave itself, across the hand.
    var wave = document.createElement("span");
    wave.className = "umt-wave-band";
    wave.style.left = panelBox.left + "px";
    wave.style.top = panelBox.top + "px";
    wave.style.width = panelBox.width + "px";
    wave.style.height = panelBox.height + "px";
    wave.innerHTML = '<svg viewBox="0 0 200 100" preserveAspectRatio="none"><path d="M0 70 C20 40 40 40 60 60 S100 85 120 55 S160 25 200 50 V100 H0Z" fill="rgba(79,179,234,0.55)"/><path d="M0 80 C25 60 45 62 70 74 S115 92 140 70 S180 52 200 64" fill="none" stroke="rgba(214,241,255,0.9)" stroke-width="3"/></svg>';
    layer.appendChild(wave);
    document.body.appendChild(layer);

    var centreX = panelBox.left + panelBox.width / 2 - 21;
    var centreY = panelBox.top + panelBox.height / 2 - 26;
    if (typeof tile.animate === "function") {
      tile.animate([
        { transform: "translate(0, 0) scale(0.4) rotate(-12deg)", opacity: 0 },
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1, offset: 0.35 },
        { transform: "translate(" + (centreX - deckBox.left) + "px, " + (centreY - deckBox.top) + "px) scale(1.25)", opacity: 1 }
      ], { duration: WAVE_MS.tile, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      tile.animate([{ opacity: 1 }, { opacity: 0, transform: "translate(" + (centreX - deckBox.left) + "px, " + (centreY - deckBox.top) + "px) scale(1.6)" }],
        { duration: 260, delay: WAVE_MS.tile + 120, fill: "forwards" });
      wave.animate([
        { transform: "translateX(-105%)", opacity: 0.2 },
        { opacity: 1, offset: 0.2 },
        { transform: "translateX(105%)", opacity: 0.9 }
      ], { duration: WAVE_MS.sweep, delay: WAVE_MS.tile, easing: "ease-in-out", fill: "both" });
      ghosts.forEach(function wash(item) {
        var reach = (item.x - panelBox.left) / Math.max(1, panelBox.width);
        item.el.animate([
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          { transform: "translate(70px, -26px) rotate(28deg)", opacity: 0 }
        ], { duration: 420, delay: WAVE_MS.tile + Math.round(reach * WAVE_MS.sweep * 0.8), easing: "ease-in", fill: "both" });
      });
    }
    setTimeout(function reveal() {
      var fresh = freshCards(event);
      endWave();
      Array.prototype.forEach.call(fresh, function rise(card, index) {
        if (typeof card.animate === "function") {
          card.animate([{ transform: "translateY(16px) scale(0.85)", opacity: 0 }, { transform: "none", opacity: 1 }],
            { duration: 280, delay: index * 40, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
        }
      });
    }, WAVE_MS.tile + WAVE_MS.sweep);
    setTimeout(function done() {
      layer.remove();
      waveBusy = false;
      playWaveFx(game);
    }, WAVE_MS.tile + WAVE_MS.sweep + WAVE_MS.settle);
  }

  // -- little bursts when a lucky, dead, idea or Joker card is tapped ---------
  // They don't do much on their own, so a tap answers with a small flourish:
  // clovers for luck, a puff of grave smog for a dead card, purple sparkles
  // for a Joker.
  var CLOVER_PARTICLE = '<svg viewBox="0 0 20 20" aria-hidden="true">'
    + [0, 90, 180, 270].map(function leaf(angle) {
      return '<path d="M10 10C7.3 8.2 6.8 5 8.5 4.8c.8-.1 1.4.5 1.5 1.1.1-.6.7-1.2 1.5-1.1 1.7.2 1.2 3.4-1.5 5.2z" fill="#4fbf4a" stroke="#2f6b1f" stroke-width=".9"'
        + (angle ? ' transform="rotate(' + angle + ' 10 10)"' : "") + "/>";
    }).join("") + "</svg>";
  var SPARKLE_PARTICLE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1l2.1 6.9L19 10l-6.9 2.1L10 19l-2.1-6.9L1 10l6.9-2.1z" fill="#c9a6ff" stroke="#6b3fd1" stroke-width="1"/></svg>';

  function burstLayer() {
    var layer = document.querySelector(".umt-tap-burst-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "umt-tap-burst-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
    }
    return layer;
  }

  function particle(layer, html, className, x, y) {
    var el = document.createElement("span");
    el.className = "umt-tap-particle " + className;
    if (html) el.innerHTML = html;
    el.style.left = x + "px";
    el.style.top = y + "px";
    layer.appendChild(el);
    return el;
  }

  function burstFor(card) {
    if (!card || reducedMotion() || !document.body || typeof card.animate !== "function") return;
    var box = card.getBoundingClientRect();
    var x = box.left + box.width / 2;
    var y = box.top + box.height / 2;
    var layer = burstLayer();
    var made = [];
    if (card.classList.contains("is-lucky")) {
      for (var i = 0; i < 6; i += 1) {
        var leaf = particle(layer, CLOVER_PARTICLE, "is-clover", x, y);
        var dx = (i - 2.5) * 20 + (Math.random() * 10 - 5);
        var dy = -60 - Math.random() * 40;
        leaf.animate([
          { transform: "translate(-50%, -50%) scale(0.3) rotate(0deg)", opacity: 0 },
          { transform: "translate(calc(-50% + " + dx * 0.5 + "px), calc(-50% + " + dy * 0.6 + "px)) scale(1) rotate(" + (dx * 3) + "deg)", opacity: 1, offset: 0.35 },
          { transform: "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px)) scale(0.8) rotate(" + (dx * 6) + "deg)", opacity: 0 }
        ], { duration: 1000 + i * 50, delay: i * 40, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" });
        made.push(leaf);
      }
      card.animate([{ transform: "scale(1)" }, { transform: "scale(1.12) rotate(-4deg)" }, { transform: "scale(1)" }], { duration: 320, easing: "ease-out" });
    } else if (card.classList.contains("is-dead")) {
      for (var j = 0; j < 5; j += 1) {
        var puff = particle(layer, "", "is-smog", x + (j - 2) * 9, y - 8);
        var drift = (Math.random() * 18 - 9);
        puff.animate([
          { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0 },
          { transform: "translate(calc(-50% + " + drift * 0.4 + "px), calc(-50% - 24px)) scale(1.1)", opacity: 0.95, offset: 0.3 },
          { transform: "translate(calc(-50% + " + drift + "px), calc(-50% - 70px)) scale(2.2)", opacity: 0 }
        ], { duration: 1200 + j * 80, delay: j * 90, easing: "ease-out", fill: "both" });
        made.push(puff);
      }
      card.animate([
        { transform: "translateX(0)" }, { transform: "translateX(-2px) rotate(-3deg)" }, { transform: "translateX(2px) rotate(3deg)" },
        { transform: "translateX(-1px) rotate(-2deg)" }, { transform: "translateX(0)" }
      ], { duration: 380, easing: "ease-in-out" });
    } else if (card.classList.contains("is-joker")) {
      for (var k = 0; k < 7; k += 1) {
        var star = particle(layer, SPARKLE_PARTICLE, "is-sparkle", x, y);
        var angle = (k / 7) * Math.PI * 2 - Math.PI / 2;
        var reach = 48 + (k % 2) * 18;
        var sx = Math.cos(angle) * reach;
        var sy = Math.sin(angle) * reach;
        star.animate([
          { transform: "translate(-50%, -50%) scale(0)", opacity: 0 },
          { transform: "translate(calc(-50% + " + sx * 0.8 + "px), calc(-50% + " + sy * 0.8 + "px)) scale(1.3) rotate(45deg)", opacity: 1, offset: 0.45 },
          { transform: "translate(calc(-50% + " + sx + "px), calc(-50% + " + sy + "px)) scale(0.2) rotate(90deg)", opacity: 0 }
        ], { duration: 720, delay: k * 80, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
        made.push(star);
      }
      card.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.5) drop-shadow(0 0 8px #b98cff)" }, { filter: "brightness(1)" }], { duration: 460 });
    } else if (card.classList.contains("is-idea")) {
      // The bulb lights up: rays of light flash out around it.
      for (var r = 0; r < 8; r += 1) {
        var ray = particle(layer, "", "is-ray", x, y);
        var turn = r * 45;
        ray.style.setProperty("--turn", turn + "deg");
        ray.animate([
          { transform: "translate(-50%, -50%) rotate(" + turn + "deg) translateY(-18px) scaleY(0.2)", opacity: 0 },
          { transform: "translate(-50%, -50%) rotate(" + turn + "deg) translateY(-34px) scaleY(1)", opacity: 1, offset: 0.4 },
          { transform: "translate(-50%, -50%) rotate(" + turn + "deg) translateY(-48px) scaleY(0.4)", opacity: 0 }
        ], { duration: 620, delay: (r % 2) * 60, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
        made.push(ray);
      }
      var glow = particle(layer, "", "is-bulb-glow", x, y);
      glow.animate([
        { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0 },
        { transform: "translate(-50%, -50%) scale(1.2)", opacity: 0.9, offset: 0.3 },
        { transform: "translate(-50%, -50%) scale(1.8)", opacity: 0 }
      ], { duration: 700, easing: "ease-out", fill: "both" });
      made.push(glow);
      card.animate([
        { transform: "scale(1)", filter: "brightness(1)" },
        { transform: "scale(1.1)", filter: "brightness(1.7) drop-shadow(0 0 10px #ffd860)" },
        { transform: "scale(1)", filter: "brightness(1)" }
      ], { duration: 520, easing: "ease-out" });
    }
    setTimeout(function cleanUp() {
      made.forEach(function drop(el) { el.remove(); });
    }, 1900);
  }

  document.addEventListener("pointerdown", function onTapBurst(event) {
    var card = event.target && event.target.closest && event.target.closest("#cuddleScreen .cuddle-card.is-lucky, #cuddleScreen .cuddle-card.is-dead, #cuddleScreen .cuddle-card.is-joker, #cuddleScreen .cuddle-card.is-idea");
    if (card) burstFor(card);
  }, true);

  // -- a lucky or dead card leaving the hand ------------------------------------
  // Mulliganed away (or washed out by a wave), a lucky card lets a clover
  // float up off its tile, and a dead card gives up a little ghost that
  // drifts away to the sky. The tiles are grouped by kind in the hand, so
  // the rect is measured now, before the hand re-renders without them.
  var GHOST_PARTICLE = '<svg viewBox="0 0 24 28" aria-hidden="true">'
    + '<path d="M12 1.5C6.8 1.5 3 5.4 3 10.6V25l3-2.4 3 2.4 3-2.4 3 2.4 3-2.4 3 2.4V10.6C21 5.4 17.2 1.5 12 1.5z" fill="rgba(244,241,255,0.92)" stroke="rgba(150,138,190,0.9)" stroke-width="1.1"/>'
    + '<ellipse cx="9" cy="11" rx="1.6" ry="2.2" fill="#3c3458"/><ellipse cx="15" cy="11" rx="1.6" ry="2.2" fill="#3c3458"/>'
    + '<ellipse cx="12" cy="16" rx="1.4" ry="1.1" fill="#3c3458" opacity="0.7"/></svg>';

  function soulsLeave(kind, count, box) {
    if (!count || !box || reducedMotion() || !document.body) return;
    var layer = burstLayer();
    // Above the hand's tiles and the deck's shuffle, not just the board.
    layer.classList.add("is-raised");
    var x = box.left + box.width / 2;
    var y = box.top + box.height / 2;
    for (var i = 0; i < Math.min(3, count); i += 1) {
      var lucky = kind === "lucky";
      var el = particle(layer, lucky ? CLOVER_PARTICLE : GHOST_PARTICLE, lucky ? "is-clover is-leaving" : "is-ghost", x, y);
      if (typeof el.animate !== "function") { el.remove(); continue; }
      var side = (i % 2 ? 1 : -1) * (6 + i * 6);
      var rise = lucky ? 120 : 150;
      var frames = lucky ? [
        { transform: "translate(-50%, -50%) scale(0.4) rotate(0deg)", opacity: 0 },
        { transform: "translate(-50%, calc(-50% - 28px)) scale(1.25) rotate(40deg)", opacity: 1, offset: 0.2 },
        { transform: "translate(calc(-50% + " + side + "px), calc(-50% - " + rise * 0.7 + "px)) scale(1.1) rotate(150deg)", opacity: 1, offset: 0.75 },
        { transform: "translate(calc(-50% + " + side * 1.4 + "px), calc(-50% - " + rise + "px)) scale(0.8) rotate(220deg)", opacity: 0 }
      ] : [
        { transform: "translate(-50%, -50%) scale(0.5)", opacity: 0 },
        { transform: "translate(calc(-50% - 6px), calc(-50% - 30px)) scale(1)", opacity: 1, offset: 0.2 },
        { transform: "translate(calc(-50% + " + (8 + side) + "px), calc(-50% - " + rise * 0.55 + "px)) scale(1) rotate(6deg)", opacity: 0.95, offset: 0.55 },
        { transform: "translate(calc(-50% - " + (4 - side) + "px), calc(-50% - " + rise + "px)) scale(0.85) rotate(-6deg)", opacity: 0 }
      ];
      var duration = lucky ? 1400 : 1700;
      // Each step eases on its own, so the flight holds its glow until near the top.
      frames.forEach(function ease(frame) { frame.easing = "ease-out"; });
      el.animate(frames, { duration: duration, delay: i * 140, easing: "linear", fill: "both" });
      setTimeout(el.remove.bind(el), duration + i * 140 + 80);
    }
  }

  var baseDiscard = proto._discardCards;
  if (typeof baseDiscard === "function") {
    proto._discardCards = function discardWithSouls(cardIds) {
      var leaving = { lucky: 0, dead: 0 };
      try {
        var ids = new Set(cardIds || []);
        (this.state && this.state.hand || []).forEach(function tally(card) {
          if (!ids.has(card.id)) return;
          if (isLuckyCard(card)) leaving.lucky += 1;
          else if (isDeadCard(card)) leaving.dead += 1;
        });
      } catch (_error) { /* the flourish is optional */ }
      var result = baseDiscard.apply(this, arguments);
      if ((leaving.lucky || leaving.dead) && typeof document !== "undefined") {
        try {
          ["lucky", "dead"].forEach(function fly(kind) {
            if (!leaving[kind]) return;
            var tile = document.querySelector("#cuddleScreen .cuddle-hand-panel .cuddle-card.is-" + kind);
            if (tile) soulsLeave(kind, leaving[kind], tile.getBoundingClientRect());
          });
        } catch (_error) { /* the flourish is optional */ }
      }
      return result;
    };
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function run() {
      pending = false;
      decorate();
      playWaveFx(activeGame());
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
