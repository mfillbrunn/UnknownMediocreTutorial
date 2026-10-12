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
 *     pays +0.5 / +1 / +2 points (halves add up within the stage).
 *   - Greyscale (cuddle-engine.js) pays 1 / 2 / 4 points a grey.
 *
 * Gambler and purist:
 *   - High Roller (common, 3 levels): every stage bets 10 / 20 / 50
 *     points. Solve by guess 5 (world 1) or guess 4 (worlds 2 and 3) and
 *     it pays double back (+the bet); later than that and the bet is lost.
 *   - Hard Mode (common, 3 levels): a stage solved in Wordle hard mode --
 *     every guess keeps each green in place and uses each yellow you were
 *     shown -- pays +10 / +20 / +40 points.
 *
 * Combine (rare): taking it turns one of your badges into a random badge
 * one rarity higher (common -> rare -> epic -> legendary). It can only
 * reshape the playstyle badges (the ones this file and cuddle-powers.js
 * keep in state.umtPowers); it isn't a badge itself and is only offered
 * while you own one it can combine.
 *
 * These powers live in the registry (cuddle-skill-tree.js) and join the
 * reward pool through cuddle-powers.js NEW_POWERS.
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
  var STRIKE_POINTS = [0, 0.5, 1, 2];
  var HIGH_ROLLER_BET = [0, 10, 20, 50];
  // The guess a High Roller bet must be won by, per world.
  var HIGH_ROLLER_BY = [5, 4, 4];
  var HARD_MODE_POINTS = [0, 10, 20, 40];
  var TIER_UP = { common: "rare", rare: "epic", epic: "legendary" };
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
    if (!value) return 0;
    var rebalance = window.CuddleRebalanceV5;
    if (rebalance && typeof rebalance.addStageBonus === "function") {
      // 0 when refused (a guess past the window earns nothing).
      return num(rebalance.addStageBonus(game, value, field, label));
    }
    game.state.score = num(game.state.score) + value;
    game.state.roundScore = num(game.state.roundScore) + value;
    return value;
  }

  function hasCombo(game, id) {
    var synergies = window.CuddleSynergies;
    try {
      return Boolean(synergies && typeof synergies.owns === "function" && synergies.owns(game, id));
    } catch (_error) {
      return false;
    }
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
    // Ascetic (Lean Build + Monk's Vow): every skip pays 30 points more.
    if (hasCombo(this, "ascetic")) points += 30;
    var money = vow || kind === "money" ? SKIP_MONEY : 0;
    state.score = num(state.score) + points;
    state.cuddleMoney = Math.max(0, num(state.cuddleMoney) + money);
    state.umtSkips = num(state.umtSkips) + 1;
    var paid = [points ? "+" + points + " points" : "", money ? "+$" + money : ""].filter(Boolean).join(" and ");
    if (hasCombo(this, "ascetic")) paid += " (Ascetic)";
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
    // Static Charge (Strike-Through + Softer Cuddle Meter): each one also
    // charges the meter; it pays out on the next guess like any grey.
    var coach = state.cuddleCoachExpansion;
    if (coach && hasCombo(game, "staticCharge")) coach.cuddleProgress = num(coach.cuddleProgress) + fresh.length;
    // Half points add up across the stage: pay whole points as they come.
    record.half = num(record.half) + fresh.length * STRIKE_POINTS[level];
    var points = Math.floor(record.half);
    record.half -= points;
    if (points <= 0) return;
    if (stageBonus(game, points, "umtStrikeThrough", "Strike-Through") > 0) {
      note(game, "Strike-Through: " + fresh.join(", ") + " ruled out, +" + points + " points.");
    }
  }

  // -- Hard Mode --------------------------------------------------------------
  // Does `word` keep every green and use every yellow the earlier guesses
  // showed? Only colours the player really saw count (masked tiles don't).
  function followsHardMode(word, earlier) {
    var guess = String(word || "").toUpperCase();
    return (earlier || []).every(function check(entry) {
      if (!entry || !entry.word) return true;
      var shown = Array.isArray(entry.shownFeedback) ? entry.shownFeedback : entry.feedback;
      if (!Array.isArray(shown)) return true;
      var masked = Array.isArray(entry.maskedIndices) ? entry.maskedIndices : [];
      var played = String(entry.word).toUpperCase();
      for (var i = 0; i < 5; i += 1) {
        if (masked.indexOf(i) !== -1) continue;
        if (shown[i] === "green" && guess[i] !== played[i]) return false;
        if (shown[i] === "yellow" && guess.indexOf(played[i]) === -1) return false;
      }
      return true;
    });
  }

  function solvedInHardMode(history) {
    for (var i = 1; i < history.length; i += 1) {
      if (!followsHardMode(history[i] && history[i].word, history.slice(0, i))) return false;
    }
    return true;
  }

  // -- Combine ---------------------------------------------------------------
  function tierOf(item) {
    return String(item && (item.tier || item.rarity || item.rewardTier || item.__cuddleV8Tier) || "").toLowerCase();
  }

  function powersLevels(state) {
    if (!state.umtPowers || typeof state.umtPowers !== "object") state.umtPowers = {};
    if (!state.umtPowers.levels || typeof state.umtPowers.levels !== "object") state.umtPowers.levels = {};
    return state.umtPowers.levels;
  }

  // Playstyle badges you own that have a rarity above them.
  function combinable(game) {
    var tree = registry();
    var levels = powersLevels(game.state);
    return Object.keys(levels).filter(function owned(id) {
      if (id === "combine" || num(levels[id]) <= 0) return false;
      var node = tree && tree.findNode(id);
      return Boolean(node && TIER_UP[String(node.tier)]);
    });
  }

  function randomOf(game) {
    return typeof game.random === "function" ? game.random : Math.random;
  }

  function combine(game) {
    var state = game.state;
    var tree = registry();
    var pool = combinable(game);
    if (!pool.length) return { ok: false, error: "You have no badge Combine can reshape." };
    var random = randomOf(game);
    var fromId = pool[Math.floor(random() * pool.length)];
    var from = tree.findNode(fromId);
    var wanted = TIER_UP[String(from.tier)];
    var options = (game._upgradeCatalog() || []).filter(function candidate(card) {
      return card && card.id !== "combine" && card.id !== fromId && tierOf(card) === wanted;
    });
    if (!options.length) return { ok: false, error: "No " + wanted + " badge is left to combine into." };
    var target = options[Math.floor(random() * options.length)];
    delete powersLevels(state)[fromId];
    var granted = game._grantUpgradeChoice(Object.assign({}, target, { key: target.key || target.id }));
    if (!granted || granted.ok === false) {
      powersLevels(state)[fromId] = 1;
      return { ok: false, error: "Combine couldn't finish: " + ((granted && granted.error) || "unknown error") };
    }
    return { ok: true, from: from.title, to: target.title || target.name, tier: wanted };
  }

  var CULL_IDS = ["umtCullOne", "umtCullTwo", "cullOne", "cullTwo"];
  var CULL_CAP = 8;

  var baseCatalog = proto._upgradeCatalog;
  proto._upgradeCatalog = function upgradeCatalogWithCombine() {
    var list = baseCatalog.apply(this, arguments) || [];
    // Culls leave the pool once the run has culled its 8 letters.
    if (this.state && typeof this._culledLetterCount === "function" && this._culledLetterCount() >= CULL_CAP) {
      list = list.filter(function keep(item) { return !item || CULL_IDS.indexOf(item.id) === -1; });
    }
    // Combine is offered only while it has something to reshape.
    if (!this.state || combinable(this).length) return list;
    return list.filter(function keep(item) { return !item || item.id !== "combine"; });
  };

  var baseChoose = proto.chooseUpgrade;
  proto.chooseUpgrade = function chooseUpgradeWithCombine(choiceKey) {
    var state = this.state;
    var choice = state && state.status === "upgrade"
      ? (state.upgradeChoices || []).find(function match(item) { return item && item.key === choiceKey; })
      : null;
    if (!choice || choice.id !== "combine") return baseChoose.apply(this, arguments);
    var special = state.upgradePhase === "difficultyStart" || state.upgradePhase === "milestone";
    var result = combine(this);
    if (!result.ok) return result;
    state = this.state;
    state.lastMessage = "Combine: " + result.from + " became " + result.to + " (" + result.tier + ").";
    state.upgradeChoices = [];
    state.upgradePhase = null;
    state.upgradeMilestone = null;
    if (!special && typeof this._advanceRound === "function") this._advanceRound();
    save(this);
    return { ok: true, combined: result };
  };

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
      var roller = Math.min(3, levelOf(this, "highRoller"));
      if (solved && roller > 0) {
        var bet = HIGH_ROLLER_BET[roller];
        // Won by guess 5 in world 1, guess 4 in worlds 2 and 3.
        var won = history.length <= HIGH_ROLLER_BY[worldIndex(this)];
        stageBonus(this, won ? bet : -bet, "umtHighRoller", won ? "High Roller won" : "High Roller lost");
        // Jackpot (High Roller + Double Down): a win pays half the bet again.
        if (won && hasCombo(this, "jackpot")) stageBonus(this, Math.round(bet / 2), "umtComboJackpot", "Jackpot");
        note(this, won ? "High Roller: bet " + bet + ", won +" + bet + "." : "High Roller: not solved by guess " + HIGH_ROLLER_BY[worldIndex(this)] + ", the " + bet + "-point bet is lost.");
      }
      var hard = Math.min(3, levelOf(this, "hardMode"));
      if (solved && hard > 0 && solvedInHardMode(history)) {
        if (stageBonus(this, HARD_MODE_POINTS[hard], "umtHardMode", "Hard Mode") > 0) {
          note(this, "Hard Mode: +" + HARD_MODE_POINTS[hard] + " points.");
        }
        if (hasCombo(this, "purist")) stageBonus(this, 30, "umtComboPurist", "Purist");
      }
      if (solved && levelOf(this, "leanBuild") > 0) {
        var pay = leanPayout(this);
        if (pay > 0 && stageBonus(this, pay, "umtLeanBuild", "Lean Build") > 0) note(this, "Lean Build: +" + pay + " points.");
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
    HIGH_ROLLER_BET: HIGH_ROLLER_BET,
    HARD_MODE_POINTS: HARD_MODE_POINTS,
    followsHardMode: followsHardMode,
    combinable: function combinableIds(game) { return combinable(game); },
    leanPayout: leanPayout,
    otherBadges: otherBadges,
    hasMonksVow: function hasMonksVow(game) { return levelOf(game, "monksVow") > 0; }
  });
}());
