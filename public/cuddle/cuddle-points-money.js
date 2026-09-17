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

  // Money tiles: a handful of board cells, rolled fresh at the start of
  // every non-boss round, that pay out for the guess played through them.
  // A yellow letter on one pays MONEY_TILE_YELLOW and a green one pays
  // double; grey pays nothing but still spends the tile. They only ever
  // sit inside the round's quick-solve window (_solveGuessThreshold():
  // 6 guesses in world one, 5 in world two, 4 in world three), so hunting
  // one is never a reason to guess past that window and eat the late
  // penalty cuddle-engine.js charges beyond it.
  var MONEY_TILE_COUNT = 3;
  var MONEY_TILE_YELLOW = 2;
  var MONEY_TILE_GREEN = MONEY_TILE_YELLOW * 2;
  var MONEY_TILE_COLUMNS = 5;

  function addMoney(state, amount) {
    state.cuddleMoney = Math.max(0, Number(state.cuddleMoney || 0) + amount);
  }

  function randomFor(game) {
    return typeof game.random === "function" ? game.random : Math.random;
  }

  function rollMoneyTiles(game) {
    var random = randomFor(game);
    var threshold = typeof game._solveGuessThreshold === "function" ? game._solveGuessThreshold() : 6;
    var rows = [];
    for (var row = 0; row < threshold; row += 1) rows.push(row);
    for (var index = rows.length - 1; index > 0; index -= 1) {
      var swap = Math.floor(random() * (index + 1));
      var held = rows[index];
      rows[index] = rows[swap];
      rows[swap] = held;
    }
    // One tile per row at most, so the three of them spread across the
    // window instead of stacking into a single lucky guess.
    return rows
      .slice(0, Math.min(MONEY_TILE_COUNT, rows.length))
      .map(function place(chosenRow) {
        return { row: chosenRow, col: Math.floor(random() * MONEY_TILE_COLUMNS), paid: false, payout: 0 };
      })
      .sort(function byRow(a, b) { return a.row - b.row; });
  }

  function payMoneyTiles(state, row, entry) {
    var tiles = Array.isArray(state.cuddleMoneyTiles) ? state.cuddleMoneyTiles : null;
    if (!tiles || !entry) return 0;
    // The true colours, not the masked ones a boss or challenge shows on
    // the board: the letter really did land where it landed, whatever the
    // feedback is willing to admit this guess.
    var feedback = Array.isArray(entry.feedback) ? entry.feedback : [];
    var earned = 0;
    tiles.forEach(function pay(tile) {
      if (!tile || tile.paid || Number(tile.row) !== row) return;
      var result = feedback[Number(tile.col)];
      var amount = result === "green" ? MONEY_TILE_GREEN : result === "yellow" ? MONEY_TILE_YELLOW : 0;
      tile.paid = true;
      tile.payout = amount;
      earned += amount;
    });
    if (earned > 0) addMoney(state, earned);
    return earned;
  }

  var originalBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundWithMoneyTiles() {
    var result = originalBeginRound.apply(this, arguments);
    var state = this.state;
    if (state) {
      // Bosses are a straight fight -- no money tiles there, only on the
      // wordle, themed wordle and challenge stops.
      state.cuddleMoneyTiles = this.isBossRound() ? [] : rollMoneyTiles(this);
    }
    return result;
  };

  var originalSubmitDraft = proto.submitDraft;
  proto.submitDraft = function submitDraftWithMoneyTiles() {
    var state = this.state;
    var before = state && Array.isArray(state.history) ? state.history.length : 0;
    var result = originalSubmitDraft.apply(this, arguments);
    if (!state || !Array.isArray(state.history) || state.history.length <= before) return result;
    var earned = payMoneyTiles(state, before, state.history[before]);
    if (earned > 0) {
      state.lastMessage = ((state.lastMessage || "") + " Money tile: +$" + earned + ".").trim();
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
