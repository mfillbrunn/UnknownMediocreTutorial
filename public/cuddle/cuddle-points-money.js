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

  // Special tiles: a few board cells, rolled fresh at the start of every
  // non-boss round, that pay out for the letter the player lands on them.
  // Each is marked on the board before it is played (a large faint symbol)
  // so it can be aimed at. A yellow or green on it pays; a grey spends it
  // for nothing. Payouts happen inside the engine's scoring step (see
  // _scoreSpecialTiles, called from cuddle-engine.js's submitDraft) so a
  // points tile counts toward the row -- and toward a solve -- on the very
  // guess that lands on it. They only ever sit inside the round's
  // quick-solve window (_solveGuessThreshold(): 6 guesses in world one, 5
  // in world two, 4 in world three), one per row at most, so hunting one is
  // never a reason to guess past that window and eat the late penalty.
  //
  // Kinds. A run starts with money and points tiles only; between-round
  // rewards (cuddle-engine.js's CUDDLE_V3_CUSTOM_REWARDS) unlock the rest,
  // and taking an unlock again makes that kind more common:
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
  var BASE_TILES_MIN = 1;
  var BASE_TILES_EXTRA_CHANCE = 0.5;

  // Relative odds of each kind for one tile. Money and points are always
  // in the pool; the unlockable kinds scale with their unlock's level
  // (level 1 unlocks, 2 and 3 make it more common), hint least of all.
  var TILE_KINDS = [
    { kind: "money", weight: function () { return 1; } },
    { kind: "points", weight: function () { return 1; } },
    { kind: "mulligan", bonus: "mulliganTiles", weight: function (level) { return 0.45 * level; } },
    { kind: "joker", bonus: "jokerTiles", weight: function (level) { return 0.3 * level; } },
    { kind: "hint", bonus: "oracleTiles", weight: function (level) { return 0.15 * level; } }
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
      var level = entry.bonus ? bonusLevel(state, entry.bonus) : 1;
      return { kind: entry.kind, weight: level > 0 ? entry.weight(level) : 0 };
    }).filter(function usable(entry) { return entry.weight > 0; });
    var total = pool.reduce(function sum(acc, entry) { return acc + entry.weight; }, 0);
    var roll = random() * total;
    for (var i = 0; i < pool.length; i += 1) {
      roll -= pool[i].weight;
      if (roll < 0) return pool[i].kind;
    }
    return pool[pool.length - 1].kind;
  }

  function rollSpecialTiles(game) {
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
    var count = BASE_TILES_MIN
      + (random() < BASE_TILES_EXTRA_CHANCE ? 1 : 0)
      + bonusLevel(state, "treasureMap")
      // Treasure Trove from the shop: +2 tiles while its stages last
      // (counted down by cuddle-shop.js once the stage has begun).
      + (state.cuddleShopV2 && Number(state.cuddleShopV2.tileStages) > 0 ? 2 : 0);
    // One tile per row at most, so they spread across the window instead
    // of stacking into a single lucky guess.
    return rows
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
      .sort(function byRow(a, b) { return a.row - b.row; });
  }

  // Pays every special tile on `row` from this guess's TRUE colours -- not
  // the masked ones a boss or challenge shows on the board: the letter
  // really did land where it landed, whatever the feedback will admit.
  // Returns the points to add to this guess's row score; everything else
  // (money, mulligans, Jokers) is granted directly, and hints are queued
  // for after the guess so the reveal can't point at a position this very
  // guess just uncovered.
  proto._scoreSpecialTiles = function scoreSpecialTiles(row, feedback) {
    var state = this.state;
    var tiles = state && Array.isArray(state.cuddleMoneyTiles) ? state.cuddleMoneyTiles : null;
    if (!tiles || !Array.isArray(feedback)) return 0;
    var points = 0;
    var notes = [];
    tiles.forEach(function pay(tile) {
      if (!tile || tile.paid || Number(tile.row) !== row) return;
      var result = feedback[Number(tile.col)];
      var hit = result === "green" || result === "yellow";
      var green = result === "green";
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
        notes.push("Money tile +$" + tile.payout);
      } else if (kind === "points") {
        tile.payout = green ? POINTS_TILE_GREEN : POINTS_TILE_YELLOW;
        tile.label = "+" + tile.payout;
        points += tile.payout;
        notes.push("Points tile +" + tile.payout);
      } else if (kind === "mulligan") {
        tile.payout = 1;
        tile.label = "+1";
        state.mulligansLeft = Math.max(0, Number(state.mulligansLeft) || 0) + 1;
        notes.push("Mulligan tile +1 mulligan");
      } else if (kind === "joker") {
        tile.payout = 1;
        tile.label = "+1";
        var mega = state.megaState || (state.megaState = {});
        mega.jokerCharges = Math.max(0, Number(mega.jokerCharges) || 0) + 1;
        notes.push("Joker tile +1 Joker");
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
      state.pendingTileNotes = [];
      // Bosses are a straight fight -- no special tiles there, only on the
      // wordle, themed wordle and challenge stops.
      state.cuddleMoneyTiles = this.isBossRound() ? [] : rollSpecialTiles(this);
    }
    return result;
  };

  var originalSubmitDraft = proto.submitDraft;
  proto.submitDraft = function submitDraftWithSpecialTiles() {
    var result = originalSubmitDraft.apply(this, arguments);
    var state = this.state;
    if (!state) return result;
    var notes = Array.isArray(state.pendingTileNotes) ? state.pendingTileNotes : [];
    state.pendingTileNotes = [];
    var hints = Math.max(0, Number(state.pendingTileHints) || 0);
    state.pendingTileHints = 0;
    // Hints only mean something while the round is still being played.
    if (hints > 0 && state.status === "playing" && typeof this._revealPositionPeek === "function") {
      for (var i = 0; i < hints; i += 1) notes.push("Oracle tile: " + this._revealPositionPeek());
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
