/* CUDDLE_POINTS_MONEY v1
 * Two separate currencies, kept deliberately apart:
 *
 *  - Points (state.score) -- everything earned from ordinary play: tile
 *    colors, quest bonuses, the solve-speed threshold in cuddle-engine.js.
 *    This is the number the round-end cash-out (cuddle-money-mode.js)
 *    animates and the number a round is measured against to advance.
 *
 *  - Money (state.cuddleMoney) -- the run's only spendable currency.
 *    Earned a flat amount per stage cleared (below) and from a mini
 *    challenge's own reward (cuddle-money-mode.js redirects that
 *    separately); spent in the Wandering Paw shop, on branch-map events,
 *    and on the Easy-mode Word Duel sacrifice (cuddle-campaign.js,
 *    cuddle-coach-expansion.js, cuddle-rebalance-v5.js, cuddle-branch-map.js,
 *    cuddle-expanded-stages.js, cuddle-stability-v2.js all read/write it
 *    directly at their own purchase sites).
 *
 * This file's own job is just the stage-clear grant: +10 Money the moment
 * a stage is actually left behind, wherever that happens to occur in the
 * upgrade-pick / boss-gate / campaign-win chain.
 *
 * Loaded LAST among the addon layers (right before the deferred
 * cuddle-economy-rarity-v8.js), deliberately -- cuddle-branch-map.js
 * replaces _advanceRound outright for a branch-map run rather than
 * composing with whatever was there before ("never reached from here",
 * by its own comment), so a wrap installed any earlier than that would
 * simply be discarded for every branch-map run, the game's normal mode.
 * Sitting last means this always wraps whichever _advanceRound is
 * actually bound by the time the game runs, branch-map's or the base
 * engine's linear one.
 */
(function installCuddlePointsMoney() {
  "use strict";

  var Engine = window.CuddleEngine;
  if (!Engine || !Engine.CuddleGame) {
    console.error("Cuddle Points/Money: CuddleEngine was not available.");
    return;
  }

  var Game = Engine.CuddleGame;
  var proto = Game.prototype;
  if (proto.__cuddlePointsMoneyInstalled) return;
  Object.defineProperty(proto, "__cuddlePointsMoneyInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  // Flat Money reward for clearing a stage. A later reward can grant more
  // on top of this (see the module comment above) -- this is just the
  // baseline every stage pays regardless of what else is unlocked.
  var STAGE_CLEAR_MONEY = 10;
  // Read by the cash-out, which shows this money before it's paid (it lands
  // when the stage is left, after the reward pick).
  window.CuddleStageClearMoney = STAGE_CLEAR_MONEY;

  // Special squares: a few board cells, rolled fresh at the start of every
  // round, boss fights included, that pay out for the letter the player lands on them.
  // Each is marked on the board before it is played (a large faint symbol)
  // so it can be aimed at. A yellow or green on it pays; a grey spends it
  // for nothing. Payouts happen inside the engine's scoring step (see
  // _scoreSpecialTiles, called from cuddle-engine.js's submitDraft) so a
  // points square counts toward the row -- and toward a solve -- on the very
  // guess that lands on it. They only ever sit inside the round's
  // quick-solve window (_solveGuessThreshold(): 6 guesses in world one, 5
  // in world two, 4 in world three), one per row at most, so hunting one is
  // never a reason to guess past that window and eat the late penalty.
  //
  // Kinds. A run starts with money and points squares only; the other three
  // each need their unlock reward (Mulligan / Joker / Oracle Squares):
  //   money    $  gold   +$2 on yellow, +$4 on green
  //   points   P  green  +5 points on yellow, +10 on green
  //   mulligan ↻         +1 mulligan (yellow or green alike)
  //   joker    ★         +1 Joker
  //   hint     ?         reveals one letter and its exact position (rarest)
  var MONEY_TILE_YELLOW = 2;
  var MONEY_TILE_GREEN = MONEY_TILE_YELLOW * 2;
  var POINTS_TILE_YELLOW = 5;
  var POINTS_TILE_GREEN = POINTS_TILE_YELLOW * 2;
  var TILE_COLUMNS = 5;

  // How many a stage gets: one or two (1.5 on average), plus one more per
  // Treasure Map.
  // Each guess in the bonus window has about a one-in-four chance of a
  // special square (one per row at most); Treasure Map and Treasure Trove add
  // tiles on top of that.
  var TILE_CHANCE_PER_GUESS = 0.25;
  // A three-level power's steps (cuddle-skill-tree.js): 1, 2, then 4.
  var LEVEL_STEP = [0, 1, 2, 4];

  // Relative odds of each kind for one tile. Every kind needs its badge
  // (money and points: Bonus Squares); level 1 unlocks it, 2 and 3 make it
  // more common, hint least of all.
  var TILE_KINDS = [
    { kind: "money", bonus: "bonusSquares", weight: function (level) { return level; } },
    { kind: "points", bonus: "bonusSquares", weight: function (level) { return level; } },
    { kind: "mulligan", bonus: "mulliganTiles", weight: function (level) { return 0.9 * level; } },
    { kind: "joker", bonus: "jokerTiles", weight: function (level) { return 0.6 * level; } },
    { kind: "hint", bonus: "oracleTiles", weight: function (level) { return 0.4 * level; } }
  ];

  function addMoney(state, amount) {
    state.cuddleMoney = Math.max(0, Number(state.cuddleMoney || 0) + amount);
  }

  function randomFor(game) {
    return typeof game.random === "function" ? game.random : Math.random;
  }

  function bonusLevel(state, id) {
    var bonuses = state && state.cuddleBonuses;
    return Math.max(0, Number(bonuses && bonuses[id]) || 0);
  }

  function pickKind(state, random) {
    var pool = TILE_KINDS.map(function weigh(entry) {
      var level = bonusLevel(state, entry.bonus);
      // Levels 1, 2, 3 weigh x1, x2, x4: the third pick is the big one.
      return { kind: entry.kind, weight: level > 0 ? entry.weight(LEVEL_STEP[Math.min(3, Math.floor(level))]) : 0 };
    }).filter(function usable(entry) { return entry.weight > 0; });
    // Squares from Treasure Map, the shop or a world trait with no square
    // badge to say what they are: money or points.
    if (!pool.length) return random() < 0.5 ? "money" : "points";
    var total = pool.reduce(function sum(acc, entry) { return acc + entry.weight; }, 0);
    var roll = random() * total;
    for (var i = 0; i < pool.length; i += 1) {
      roll -= pool[i].weight;
      if (roll < 0) return pool[i].kind;
    }
    return pool[pool.length - 1].kind;
  }

  function rollSpecialTiles(game) {
    // A first run has no special squares (cuddle-first-run.js).
    if (window.CuddleFirstRun && window.CuddleFirstRun.noSquares(game)) return [];
    var random = randomFor(game);
    var state = game.state || {};
    var threshold = typeof game._solveGuessThreshold === "function" ? game._solveGuessThreshold() : 6;
    var rows = [];
    for (var row = 0; row < threshold; row += 1) rows.push(row);
    for (var index = rows.length - 1; index > 0; index -= 1) {
      var swap = Math.floor(random() * (index + 1));
      var held = rows[index];
      rows[index] = rows[swap];
      rows[swap] = held;
    }
    // The board's own squares need a square badge; without one a stage
    // has none (Treasure Map and the rest below still add theirs).
    var owned = TILE_KINDS.some(function has(entry) { return bonusLevel(state, entry.bonus) > 0; });
    var bonusExtra = [0, 0, 1, 2][Math.min(3, Math.floor(bonusLevel(state, "bonusSquares")))];
    var count = (owned ? rows.filter(function roll() { return random() < TILE_CHANCE_PER_GUESS; }).length : 0)
      + bonusExtra
      + LEVEL_STEP[Math.min(3, Math.floor(bonusLevel(state, "treasureMap")))]
      // Treasure Trove from the shop: +2 tiles while its stages last
      // (counted down by cuddle-shop.js once the stage has begun).
      + (state.cuddleShopV2 && Number(state.cuddleShopV2.tileStages) > 0 ? 2 : 0)
      // The Sunlit Meadow's In Bloom trait (cuddle-world-identity.js).
      + (window.CuddleWorldIdentity ? window.CuddleWorldIdentity.extraSpecialTiles(game) : 0);
    // One tile per row at most, so they spread across the window instead
    // of stacking into a single lucky guess.
    var placed = rows
      .slice(0, Math.min(count, rows.length))
      .map(function place(chosenRow) {
        return {
          row: chosenRow,
          col: Math.floor(random() * TILE_COLUMNS),
          kind: pickKind(state, random),
          paid: false,
          payout: 0,
          label: ""
        };
      })
      ;
    // Squares III (cuddle-schools.js): devil squares, on top of the rest
    // (they may share a guess with another square, never its tile).
    var devils = window.CuddleSchools && typeof window.CuddleSchools.perk === "function"
      ? Number(window.CuddleSchools.perk(game, "squaresDevil")) || 0 : 0;
    for (var d = 0, tries = 0; d < devils && tries < 40; tries += 1) {
      var spot = { row: Math.floor(random() * threshold), col: Math.floor(random() * TILE_COLUMNS) };
      if (placed.some(function taken(tile) { return tile.row === spot.row && tile.col === spot.col; })) continue;
      placed.push({ row: spot.row, col: spot.col, kind: "devil", paid: false, payout: 0, label: "" });
      d += 1;
    }
    return placed.sort(function byRow(a, b) { return a.row - b.row || a.col - b.col; });
  }

  // A devil square set off (a letter not in the answer on it): after the
  // guess, every consonant that was held back from it (in the hand, not in
  // the word; `held` lists those card ids) is tested. Those not in the
  // answer are ruled out and thrown away, as if played; those in it turn
  // yellow and stay. The hand then refills.
  function devilTest(game, held) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    var letters = [];
    (state.hand || []).forEach(function each(card) {
      if (!card || held.indexOf(card.id) === -1) return;
      var letter = String(card && card.glyph || "").toUpperCase();
      if (!/^[A-Z]$/.test(letter) || "AEIOU".indexOf(letter) !== -1 || letters.indexOf(letter) !== -1) return;
      if (card.source === "joker" || (typeof game.isInfiniteCard === "function" && game.isInfiniteCard(card))) return;
      letters.push(letter);
    });
    if (!letters.length) return "Devil square: no consonants left in your hand to test.";
    var present = letters.filter(function inWord(letter) { return secret.indexOf(letter) !== -1; });
    var absent = letters.filter(function out(letter) { return secret.indexOf(letter) === -1; });
    if (present.length) state.knownPresent = Array.from(new Set((state.knownPresent || []).concat(present))).sort();
    if (absent.length) {
      state.knownAbsent = Array.from(new Set((state.knownAbsent || []).concat(absent))).sort();
      var ids = state.hand.filter(function gone(card) {
        return card && card.source !== "joker" && absent.indexOf(String(card.glyph || "").toUpperCase()) !== -1;
      }).map(function id(card) { return card.id; });
      if (ids.length && typeof game._discardCards === "function") game._discardCards(ids);
    }
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
    if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
    return "Devil square: tested " + letters.join(", ")
      + (absent.length ? "; " + absent.join(", ") + " not in the answer, thrown out" : "")
      + (present.length ? "; " + present.join(", ") + " in it" : "");
  }

  // Pays every special square on `row` from this guess's TRUE colours -- not
  // the masked ones a boss or challenge shows on the board: the letter
  // really did land where it landed, whatever the feedback will admit.
  // Returns the points to add to this guess's row score; everything else
  // (money, mulligans, Jokers) is granted directly, and hints are queued
  // for after the guess so the reveal can't point at a position this very
  // guess just uncovered.
  proto._scoreSpecialTiles = function scoreSpecialTiles(row, feedback) {
    var game = this;
    var state = this.state;
    var tiles = state && Array.isArray(state.cuddleMoneyTiles) ? state.cuddleMoneyTiles : null;
    if (!tiles || !Array.isArray(feedback)) return 0;
    var points = 0;
    var notes = [];
    // Squares school (cuddle-schools.js): rank I pays a yellow like a
    // green; rank II lets a yellow or green beside a square set it off too.
    // Being set off from beside is just that -- it pays what a yellow on
    // the square would, never more. (Devil squares go off on their own
    // tile's grey only, below.)
    var schools = window.CuddleSchools;
    var even = schools && typeof schools.perk === "function" && schools.perk(game, "squaresEven") > 0;
    var spread = schools && typeof schools.perk === "function" && schools.perk(game, "squaresSpread") > 0;
    var lit = function lit(col) {
      var own = feedback[col];
      if (own === "green" || own === "yellow") return own;
      if (!spread) return null;
      var sides = [feedback[col - 1], feedback[col + 1]];
      return sides.indexOf("green") !== -1 || sides.indexOf("yellow") !== -1 ? "yellow" : null;
    };
    tiles.forEach(function pay(tile) {
      if (!tile || tile.paid || Number(tile.row) !== row) return;
      // A devil square goes off on a letter that's NOT in the answer.
      if (tile.kind === "devil") {
        tile.paid = true;
        tile.hit = feedback[Number(tile.col)] === "grey";
        tile.payout = tile.hit ? 1 : 0;
        tile.label = tile.hit ? "Test" : "";
        if (tile.hit) state.pendingDevilTests = Math.max(0, Number(state.pendingDevilTests) || 0) + 1;
        return;
      }
      var result = lit(Number(tile.col));
      var hit = Boolean(result);
      var green = result === "green" || (hit && even);
      var kind = tile.kind || "money";
      tile.paid = true;
      tile.hit = hit;
      tile.payout = 0;
      tile.label = "";
      if (!hit) return;
      if (kind === "money") {
        tile.payout = green ? MONEY_TILE_GREEN : MONEY_TILE_YELLOW;
        tile.label = "+$" + tile.payout;
        addMoney(state, tile.payout);
        notes.push("Money square +$" + tile.payout);
      } else if (kind === "points") {
        tile.payout = green ? POINTS_TILE_GREEN : POINTS_TILE_YELLOW;
        tile.label = "+" + tile.payout;
        points += tile.payout;
        notes.push("Points square +" + tile.payout);
      } else if (kind === "mulligan") {
        var gained = typeof game.mulliganGain === "function" ? game.mulliganGain(1) : 1;
        tile.payout = gained;
        tile.label = "+" + gained;
        state.mulligansLeft = Math.max(0, Number(state.mulligansLeft) || 0) + gained;
        notes.push("Mulligan square +" + gained + " mulligan" + (gained === 1 ? "" : "s"));
      } else if (kind === "joker") {
        tile.payout = 1;
        tile.label = "+1";
        var mega = state.megaState || (state.megaState = {});
        mega.jokerCharges = Math.max(0, Number(mega.jokerCharges) || 0) + 1;
        notes.push("Joker square +1 Joker card");
      } else if (kind === "hint") {
        tile.payout = 1;
        tile.label = "Hint";
        state.pendingTileHints = Math.max(0, Number(state.pendingTileHints) || 0) + 1;
      }
    });
    if (notes.length) state.pendingTileNotes = (state.pendingTileNotes || []).concat(notes);
    return points;
  };

  var originalBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundWithSpecialTiles() {
    var result = originalBeginRound.apply(this, arguments);
    var state = this.state;
    if (state) {
      state.pendingTileHints = 0;
      state.pendingDevilTests = 0;
      state.pendingTileNotes = [];
      // Every stage rolls them, boss fights included.
      state.cuddleMoneyTiles = rollSpecialTiles(this);
      this._avoidMaskedSpecialTiles();
    }
    return result;
  };

  // A special square never sits on a tile a boss, challenge or curse will
  // mark: it moves to an unmarked tile of the same guess, or is dropped
  // when that guess has none. Run again once the stage's challenge is
  // known (cuddle-rebalance-v5.js finishBeginRound).
  proto._avoidMaskedSpecialTiles = function avoidMaskedSpecialTiles() {
    var game = this;
    var state = this.state;
    var tiles = state && Array.isArray(state.cuddleMoneyTiles) ? state.cuddleMoneyTiles : null;
    if (!tiles || typeof this.maskedColumnsForGuess !== "function") return;
    var random = randomFor(this);
    state.cuddleMoneyTiles = tiles.filter(function keepClear(tile) {
      if (!tile || tile.paid) return true;
      var masked;
      try {
        masked = game.maskedColumnsForGuess(Number(tile.row)) || [];
      } catch (error) {
        return true;
      }
      if (masked.indexOf(Number(tile.col)) === -1) return true;
      var open = [];
      for (var col = 0; col < TILE_COLUMNS; col += 1) if (masked.indexOf(col) === -1) open.push(col);
      if (!open.length) return false;
      tile.col = open[Math.floor(random() * open.length)];
      return true;
    });
  };

  function revealTileHints(game, count) {
    var notes = [];
    if (typeof game._revealPositionPeek !== "function") return notes;
    for (var i = 0; i < count; i += 1) notes.push("Oracle square: " + game._revealPositionPeek());
    return notes;
  }

  var originalChooseQuestReward = proto.chooseQuestReward;
  if (typeof originalChooseQuestReward === "function") {
    proto.chooseQuestReward = function chooseQuestRewardThenTileHints() {
      var result = originalChooseQuestReward.apply(this, arguments);
      var state = this.state;
      var hints = state ? Math.max(0, Number(state.pendingTileHints) || 0) : 0;
      if (hints > 0 && state.status === "playing") {
        state.pendingTileHints = 0;
        var notes = revealTileHints(this, hints);
        if (notes.length) {
          state.lastMessage = ((state.lastMessage || "") + " " + notes.map(function trimStop(note) {
            return String(note).replace(/\.+$/, "");
          }).join(". ") + ".").trim();
        }
        if (typeof this.save === "function") this.save();
      }
      return result;
    };
  }

  var originalSubmitDraft = proto.submitDraft;
  proto.submitDraft = function submitDraftWithSpecialTiles() {
    var before = this.state;
    // The cards held back from this guess, for a devil square's test.
    var held = before && Array.isArray(before.hand) ? before.hand.filter(function kept(card) {
      return card && (before.draft || []).indexOf(card.id) === -1;
    }).map(function id(card) { return card.id; }) : [];
    var result = originalSubmitDraft.apply(this, arguments);
    var state = this.state;
    if (!state) return result;
    var notes = Array.isArray(state.pendingTileNotes) ? state.pendingTileNotes : [];
    state.pendingTileNotes = [];
    var hints = Math.max(0, Number(state.pendingTileHints) || 0);
    state.pendingTileHints = 0;
    var devils = Math.max(0, Number(state.pendingDevilTests) || 0);
    state.pendingDevilTests = 0;
    // A devil test while the hand is still in play (not on a solve).
    if (devils > 0 && (state.status === "playing" || state.status === "questReward")) notes.push(devilTest(this, held));
    // Hints only mean something while the round is still being played. A
    // guess that also completes a quest opens the quest reward first: the
    // hint waits for it (revealTileHints, after chooseQuestReward) instead
    // of being thrown away.
    if (hints > 0 && state.status === "playing") {
      revealTileHints(this, hints).forEach(function add(note) { notes.push(note); });
    } else if (hints > 0 && state.status === "questReward") {
      state.pendingTileHints = hints;
    }
    if (notes.length) {
      var sentences = notes.map(function trimStop(note) { return String(note).replace(/\.+$/, ""); });
      state.lastMessage = ((state.lastMessage || "") + " " + sentences.join(". ") + ".").trim();
      if (typeof this.save === "function") this.save();
    }
    return result;
  };

  // _advanceRound is what actually leaves a stage behind -- called once a
  // reward pick (or boss-reward pick) resolves, whether that lands on the
  // next numbered round, a boss gate, or the campaign's own "won" ending.
  // Comparing round/status before and after the ORIGINAL call (rather than
  // trusting any one caller's intent) is what makes this immune to the
  // internal mega.suppressAdvance short-circuit cuddle-engine.js itself
  // uses during the start-of-run multi-pick flow: a suppressed call
  // changes neither field, so nothing is paid out for it.
  var originalAdvanceRound = proto._advanceRound;
  proto._advanceRound = function advanceRoundCuddlePointsMoney() {
    var state = this.state;
    var roundBefore = state ? state.round : null;
    var statusBefore = state ? state.status : null;
    var result = originalAdvanceRound.apply(this, arguments);
    if (state && (state.round !== roundBefore || state.status !== statusBefore)) {
      addMoney(state, STAGE_CLEAR_MONEY);
      state.lastMessage = ((state.lastMessage || "") + ` Stage cleared: +$${STAGE_CLEAR_MONEY}.`).trim();
    }
    return result;
  };

  // The one stage-clear _advanceRound above can't see: beating the FINAL
  // boss jumps straight to state.status = "won" inside _clearBoss itself
  // (see cuddle-engine.js) rather than the usual "upgrade" reward-pick
  // screen that later calls _advanceRound on confirm -- there's no reward
  // pick left to confirm, so that hook never fires for it. Every other
  // boss clear (gate !== "final") still lands on "upgrade" and is paid
  // once through _advanceRound as normal, so this only ever fires once
  // per run, on the one transition the other hook structurally cannot see.
  var originalClearBoss = proto._clearBoss;
  if (typeof originalClearBoss === "function") {
    proto._clearBoss = function clearBossCuddlePointsMoney() {
      var isFinal = this.state?.boss?.gate === "final";
      var result = originalClearBoss.apply(this, arguments);
      if (isFinal && this.state) {
        addMoney(this.state, STAGE_CLEAR_MONEY);
        this.state.lastMessage = ((this.state.lastMessage || "") + ` Stage cleared: +$${STAGE_CLEAR_MONEY}.`).trim();
      }
      return result;
    };
  }
})();
