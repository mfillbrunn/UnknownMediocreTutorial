/* Cuddle: Minimalist and Eliminator.
 *
 * Minimalist -- grow stronger by taking less:
 *   - Skipping: an ordinary "round cleared" reward screen can be skipped
 *     for +40 points or +$15 (the player picks). Boss/legendary picks,
 *     starting rewards and Free Upgrade / event picks can't be skipped.
 *   - Lean Build (epic, one-time): every solved stage pays a flat 20 / 40
 *     / 100 points (world 1 / 2 / 3), minus 5 for every other badge you
 *     own.
 *   - Monk's Vow (rare, one-time): a skip pays both, +40 points and +$15.
 *
 * Eliminator -- score by ruling letters out:
 *   - Strike-Through (rare, 3 levels): every consonant ruled out during a
 *     stage (a grey, Process of Elimination, a Rule Out reward, a whisper)
 *     pays +2 / +3 / +5 points.
 *   - Greyscale (cuddle-engine.js) pays 1 / 3 / 5 points a grey.
 *
 * The three powers live in the registry (cuddle-skill-tree.js) and join
 * the reward pool through cuddle-powers.js NEW_POWERS.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleStrategies) return;
  var proto = Game.prototype;
  proto.__cuddleStrategies = true;

  var SKIP_POINTS = 40;
  var SKIP_MONEY = 15;
  var LEAN_BY_WORLD = [20, 40, 100];
  var LEAN_PER_BADGE = 5;
  var STRIKE_POINTS = [0, 2, 3, 5];
  var VOWELS = "AEIOU";

  function num(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function registry() {
    return window.CuddleSkillTree || null;
  }

  function levelOf(game, id) {
    var tree = registry();
    var node = tree && tree.findNode(id);
    if (!node || !game) return 0;
    try {
      return Math.max(0, Math.floor(num(tree.level(game, node))));
    } catch (_error) {
      return 0;
    }
  }

  function note(game, text) {
    game.state.lastMessage = ((game.state.lastMessage || "") + " " + text).trim();
  }

  function stageBonus(game, amount, field, label) {
    var value = Math.round(num(amount));
    if (!value) return;
    var rebalance = window.CuddleRebalanceV5;
    if (rebalance && typeof rebalance.addStageBonus === "function") {
      rebalance.addStageBonus(game, value, field, label);
      return;
    }
    game.state.score = num(game.state.score) + value;
    game.state.roundScore = num(game.state.roundScore) + value;
  }

  function save(game) {
    try {
      if (typeof game.save === "function") game.save();
    } catch (_error) {
      // The next save picks it up.
    }
  }

  // -- skipping a reward ----------------------------------------------------
  proto.canSkipUpgrade = function canSkipUpgrade() {
    var state = this.state;
    if (!state || state.status !== "upgrade" || state.upgradePhase !== "round") return false;
    if (state.legendaryOffer || state.umtEventPick) return false;
    if (typeof this.isWaystoneUpgrade === "function" && this.isWaystoneUpgrade()) return false;
    return Array.isArray(state.upgradeChoices) && state.upgradeChoices.length > 0;
  };

  proto.skipUpgrade = function skipUpgrade(kind) {
    if (!this.canSkipUpgrade()) return { ok: false, error: "This reward can't be skipped." };
    var state = this.state;
    var vow = levelOf(this, "monksVow") > 0;
    var points = vow || kind !== "money" ? SKIP_POINTS : 0;
    var money = vow || kind === "money" ? SKIP_MONEY : 0;
    state.score = num(state.score) + points;
    state.cuddleMoney = Math.max(0, num(state.cuddleMoney) + money);
    state.umtSkips = num(state.umtSkips) + 1;
    var paid = [points ? "+" + points + " points" : "", money ? "+$" + money : ""].filter(Boolean).join(" and ");
    state.lastMessage = "Reward skipped: " + paid + (vow ? " (Monk's Vow)." : ".");
    state.upgradeChoices = [];
    state.upgradePhase = null;
    state.upgradeMilestone = null;
    if (typeof this._advanceRound === "function") this._advanceRound();
    save(this);
    return { ok: true, points: points, money: money };
  };

  // -- Lean Build -----------------------------------------------------------
  function worldIndex(game) {
    var worlds = window.CuddleWorlds;
    try {
      if (worlds && typeof worlds.currentWorld === "function") {
        var world = worlds.currentWorld(game);
        if (world && Number.isFinite(Number(world.index))) return Math.max(0, Math.min(2, Number(world.index)));
      }
    } catch (_error) {
      // Fall back to the boss gates.
    }
    var gates = Array.isArray(game.state.bossGatesDone) ? game.state.bossGatesDone.length : 0;
    return Math.max(0, Math.min(2, gates));
  }

  // Every badge (registry power) you own, Lean Build itself left out.
  function otherBadges(game) {
    var tree = registry();
    if (!tree || !Array.isArray(tree.BRANCHES)) return 0;
    var count = 0;
    tree.BRANCHES.forEach(function branch(group) {
      (group.nodes || []).forEach(function node(item) {
        if (!item || item.id === "leanBuild") return;
        try {
          if (num(tree.level(game, item)) > 0) count += 1;
        } catch (_error) {
          // An unreadable badge doesn't count.
        }
      });
    });
    return count;
  }

  function leanPayout(game) {
    var base = LEAN_BY_WORLD[worldIndex(game)];
    return Math.max(0, base - LEAN_PER_BADGE * otherBadges(game));
  }

  // -- Strike-Through -------------------------------------------------------
  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  // Pays for every consonant that joined the ruled-out list since the
  // last look. The stage's record resets with the stage.
  function settleStrikes(game) {
    var state = game && game.state;
    if (!state || inDuel(state)) return;
    var level = Math.min(3, levelOf(game, "strikeThrough"));
    var key = stageKey(state);
    if (!state.umtStrikes || state.umtStrikes.key !== key) state.umtStrikes = { key: key, letters: [] };
    var record = state.umtStrikes;
    var fresh = (state.knownAbsent || []).filter(function consonant(letter) {
      return /^[A-Z]$/.test(letter) && VOWELS.indexOf(letter) === -1 && record.letters.indexOf(letter) === -1;
    });
    if (!fresh.length) return;
    record.letters = record.letters.concat(fresh);
    if (level <= 0) return;
    var points = fresh.length * STRIKE_POINTS[level];
    stageBonus(game, points, "umtStrikeThrough", "Strike-Through");
    note(game, "Strike-Through: " + fresh.join(", ") + " ruled out, +" + points + " points.");
  }

  // -- hooks ----------------------------------------------------------------
  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithStrategies() {
    var state = this.state;
    var before = state && Array.isArray(state.history) ? state.history.length : 0;
    var result = baseSubmit.apply(this, arguments);
    state = this.state;
    var history = state && Array.isArray(state.history) ? state.history : [];
    if (!result || !result.ok || history.length <= before || inDuel(state)) return result;
    try {
      settleStrikes(this);
      var entry = history[history.length - 1];
      var solved = Boolean(entry && state.secret && entry.word === state.secret);
      if (solved && levelOf(this, "leanBuild") > 0) {
        var pay = leanPayout(this);
        if (pay > 0) {
          stageBonus(this, pay, "umtLeanBuild", "Lean Build");
          note(this, "Lean Build: +" + pay + " points.");
        }
      }
      save(this);
    } catch (error) {
      console.warn("Cuddle strategies: a payout failed after a guess.", error);
    }
    return result;
  };

  // Letters ruled out outside a guess (quest rewards, reward effects).
  ["chooseQuestReward", "_applyRewardEffect"].forEach(function wrap(name) {
    var base = proto[name];
    if (typeof base !== "function") return;
    proto[name] = function thenSettleStrikes() {
      var result = base.apply(this, arguments);
      try {
        if (this.state && this.state.status === "playing") settleStrikes(this);
      } catch (error) {
        console.warn("Cuddle strategies: Strike-Through failed.", error);
      }
      return result;
    };
  });

  window.CuddleStrategies = Object.freeze({
    SKIP_POINTS: SKIP_POINTS,
    SKIP_MONEY: SKIP_MONEY,
    LEAN_BY_WORLD: LEAN_BY_WORLD,
    STRIKE_POINTS: STRIKE_POINTS,
    leanPayout: leanPayout,
    otherBadges: otherBadges,
    hasMonksVow: function hasMonksVow(game) { return levelOf(game, "monksVow") > 0; }
  });
}());
