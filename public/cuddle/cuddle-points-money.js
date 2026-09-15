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

  function addMoney(state, amount) {
    state.cuddleMoney = Math.max(0, Number(state.cuddleMoney || 0) + amount);
  }

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
