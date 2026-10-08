/* Cuddle: run statistics for the end screen.
 *
 * Kept on the run (state.umtRunStats) as it is played, for every ordinary
 * and boss stage (the Duel keeps its own board and isn't counted):
 *   guesses   every guess submitted
 *   letters   letters tested: the different letters tried in each stage,
 *             added up over the run
 *   stages    stages solved, and inWindow -- how many of them were solved
 *             within the world's guess window (6, 5, 4)
 *   skulls    the difficulty skulls on the map stops that were solved
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  if (!Engine || !Engine.CuddleGame) return;
  var proto = Engine.CuddleGame.prototype;
  if (proto.__cuddleRunStats) return;
  proto.__cuddleRunStats = true;

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function statsOf(state) {
    var stats = state.umtRunStats;
    if (!stats || typeof stats !== "object") {
      stats = state.umtRunStats = { guesses: 0, letters: 0, stages: 0, inWindow: 0, skulls: 0, stageKey: "", stageLetters: [] };
    }
    return stats;
  }

  function stageKey(state) {
    return [state.runId || "run", state.round || 0, state.secret || ""].join(":");
  }

  function currentNode(state) {
    var map = state.branchMap;
    var spot = map && map.position;
    if (!spot || !Array.isArray(map.rows) || !map.rows[spot.row]) return null;
    var nodes = map.rows[spot.row].nodes || [];
    for (var i = 0; i < nodes.length; i += 1) if (nodes[i] && nodes[i].col === spot.col) return nodes[i];
    return null;
  }

  function skullsFor(game, node) {
    if (!node || node.type === "boss") return 0;
    var rebalance = window.CuddleRebalanceV5;
    try {
      var variant = rebalance && typeof rebalance.stopVariant === "function" ? rebalance.stopVariant(game, node) : null;
      return variant ? Math.max(0, Math.min(3, Number(variant.skulls) || 0)) : 0;
    } catch (_error) {
      return 0;
    }
  }

  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithStats() {
    var before = this.state ? (this.state.history || []).length : 0;
    var result = baseSubmit.apply(this, arguments);
    var state = this.state;
    try {
      if (state && !inDuel(state) && (state.history || []).length > before) {
        var stats = statsOf(state);
        var entry = state.history[state.history.length - 1];
        var key = stageKey(state);
        if (stats.stageKey !== key) {
          stats.stageKey = key;
          stats.stageLetters = [];
        }
        stats.guesses += 1;
        String(entry && entry.word || "").toUpperCase().split("").forEach(function count(letter) {
          if (!/^[A-Z]$/.test(letter) || stats.stageLetters.indexOf(letter) !== -1) return;
          stats.stageLetters.push(letter);
          stats.letters += 1;
        });
      }
    } catch (_error) {
      // Stats never get in the way of a guess.
    }
    return result;
  };

  var baseResolve = proto._resolvePendingRoundEnd;
  proto._resolvePendingRoundEnd = function resolvePendingRoundEndWithStats() {
    var state = this.state;
    var pending = state && state.pendingRoundEnd;
    var solved = Boolean(pending && pending.type === "solved" && !inDuel(state));
    if (solved) {
      try {
        var stats = statsOf(state);
        stats.stages += 1;
        var window = typeof this._solveGuessThreshold === "function" ? this._solveGuessThreshold() : 6;
        if ((Number(state.guessesUsed) || (state.history || []).length) <= window) stats.inWindow += 1;
        stats.skulls += skullsFor(this, currentNode(state));
      } catch (_error) {
        // As above.
      }
    }
    return baseResolve.apply(this, arguments);
  };

  window.CuddleRunStats = Object.freeze({
    of: function of(state) {
      var stats = state && state.umtRunStats;
      return {
        guesses: Number(stats && stats.guesses) || 0,
        letters: Number(stats && stats.letters) || 0,
        stages: Number(stats && stats.stages) || 0,
        inWindow: Number(stats && stats.inWindow) || 0,
        skulls: Number(stats && stats.skulls) || 0
      };
    }
  });
}());
