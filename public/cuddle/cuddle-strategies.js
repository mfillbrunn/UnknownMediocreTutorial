/* Cuddle: Minimalist and Eliminator.
 *
 * Minimalist -- grow stronger by taking less:
 *   - Skipping: an ordinary "round cleared" reward screen can be skipped
 *     for +40 points or +$15 (the player picks). Boss/legendary picks,
 *     starting rewards and Free Upgrade / event picks can't be skipped.
 *   - Lean Build (epic, one-time): every solved stage pays a flat 20 / 40
 *     / 100 points (world 1 / 2 / 3), minus 5 for every non-Restraint badge you
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
 *   - High Roller (common, 3 levels): every stage bets 10 / 20 / 40
 *     points. Solve by guess 5 (world 1) or guess 4 (worlds 2 and 3) and
 *     it pays twice the bet (+20 / +40 / +80); later than that and the
 *     bet is lost.
 *   - Hard Mode (common, 3 levels): a stage solved in Wordle hard mode --
 *     every guess keeps each green in place and uses each yellow you were
 *     shown -- pays +35 / +60 / +100 points (it's hard with a hand of
 *     cards).
 *
 * Improve (rare; id "combine"): taking it turns one of your badges into a random badge
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
  // Skipping a level-up screen (cuddle-reward-rhythm.js) pays less than
  // skipping a new badge.
  var LEVEL_SKIP_POINTS = 25;
  var LEVEL_SKIP_MONEY = 10;
  // Monk's Vow pays both, x1, x1.25 or x1.5 by its level.
  var VOW_SCALE = [1, 1.25, 1.5];

  function levelScreen(state) {
    var rhythm = window.CuddleRewardRhythm;
    return Boolean(rhythm && typeof rhythm.shown === "function" && rhythm.shown(state) === "level");
  }

  // What a skip pays here: [points, money] for the points / money buttons,
  // or both with Monk's Vow.
  function skipPay(game) {
    var level = levelScreen(game.state);
    var points = level ? LEVEL_SKIP_POINTS : SKIP_POINTS;
    var money = level ? LEVEL_SKIP_MONEY : SKIP_MONEY;
    var vowLevel = levelOf(game, "monksVow");
    if (vowLevel > 0) {
      var scale = VOW_SCALE[Math.min(3, vowLevel) - 1];
      return { points: Math.round(points * scale), money: Math.round(money * scale), vow: true };
    }
    return { points: points, money: money, vow: false };
  }
  // Lean Build's cost per other badge, by its level.
  var LEAN_COST_BY_LEVEL = [5, 4, 3];
  var LEAN_BY_WORLD = [20, 40, 100];
  var LEAN_PER_BADGE = 5;
  var STRIKE_POINTS = [0, 1, 2, 3];
  var HIGH_ROLLER_BET = [0, 10, 20, 40];
  // A won bet pays more than it risks: twice the stake.
  var HIGH_ROLLER_WIN = [0, 20, 40, 80];
  // The guess a High Roller bet must be won by, per world.
  var HIGH_ROLLER_BY = [5, 4, 4];
  var HARD_MODE_POINTS = [0, 35, 60, 100];
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
      // 0 when nothing was paid.
      return num(rebalance.addStageBonus(game, value, field, label));
    }
    game.state.score = num(game.state.score) + value;
    game.state.roundScore = num(game.state.roundScore) + value;
    return value;
  }

  function save(game) {
    try {
      if (typeof game.save === "function") game.save();
    } catch (_error) {
      // The next save picks it up.
    }
  }

  // -- skipping a reward ----------------------------------------------------
  // A Trial's or Duel's badge can be skipped too (its pick is marked
  // skippable); other events, legendaries and waystones can't.
  function skippableEvent(state) {
    return Boolean(state && state.umtEventPick && state.umtEventPick.skippable);
  }

  proto.canSkipUpgrade = function canSkipUpgrade() {
    var state = this.state;
    if (!state || state.status !== "upgrade" || state.upgradePhase !== "round") return false;
    if (skippableEvent(state) && !state.legendaryOffer) return Array.isArray(state.upgradeChoices) && state.upgradeChoices.length > 0;
    if (state.legendaryOffer || state.umtEventPick) return false;
    if (typeof this.isWaystoneUpgrade === "function" && this.isWaystoneUpgrade()) return false;
    return Array.isArray(state.upgradeChoices) && state.upgradeChoices.length > 0;
  };

  proto.skipUpgrade = function skipUpgrade(kind) {
    if (!this.canSkipUpgrade()) return { ok: false, error: "This reward can't be skipped." };
    var state = this.state;
    var pay = skipPay(this);
    var vow = pay.vow;
    var points = vow || kind !== "money" ? pay.points : 0;
    var money = vow || kind === "money" ? pay.money : 0;
    state.score = num(state.score) + points;
    state.cuddleMoney = Math.max(0, num(state.cuddleMoney) + money);
    state.umtSkips = num(state.umtSkips) + 1;
    var paid = [points ? "+" + points + " points" : "", money ? "+$" + money : ""].filter(Boolean).join(" and ");
    state.lastMessage = "Reward skipped: " + paid + (vow ? " (Monk's Vow)." : ".");
    if (skippableEvent(state)) {
      state.umtEventPick = null;
      state.waystoneOffer = false;
      // A Hard Trial or Duel still pays its level-ups after the badge.
      var stop = state.umtLevelStop;
      var rhythm = window.CuddleRewardRhythm;
      var next = stop && stop.badgeFirst && stop.pick < stop.of && rhythm && typeof rhythm.levelChoices === "function"
        ? rhythm.levelChoices(this, 3, stop.done || []) : [];
      if (next.length) {
        stop.pick += 1;
        state.upgradeChoices = next;
        state.waystoneOffer = true;
        save(this);
        return { ok: true, points: points, money: money };
      }
      state.umtLevelStop = null;
    }
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

  // Every badge (registry power) you own outside Restraint: Restraint's
  // own badges (Lean Build itself among them) and Legendaries (which can't
  // be skipped) don't count against it.
  function otherBadges(game) {
    var tree = registry();
    if (!tree || !Array.isArray(tree.BRANCHES)) return 0;
    var count = 0;
    tree.BRANCHES.forEach(function branch(group) {
      (group.nodes || []).forEach(function node(item) {
        if (!item || item.id === "leanBuild" || item.school === "pearl" || item.tier === "legendary") return;
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
    // Pearl II: 3 badges don't count against it.
    var schools = window.CuddleSchools;
    var ignored = schools && typeof schools.perk === "function" ? num(schools.perk(game, "leanIgnore")) : 0;
    var perBadge = LEAN_COST_BY_LEVEL[Math.max(1, Math.min(3, levelOf(game, "leanBuild"))) - 1];
    return Math.max(0, base - perBadge * Math.max(0, otherBadges(game) - ignored));
  }

  // -- Strike-Through -------------------------------------------------------
  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  // Pays for every consonant that joined the ruled-out list since the
  // last look. The stage's record resets with the stage.
  function settleStrikes(game) {
    var state = game && game.state;
    if (!state) return;
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

  // -- Improve (id "combine") --------------------------------------------------
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
    if (!pool.length) return { ok: false, error: "You have no badge Improve can raise." };
    var random = randomOf(game);
    var fromId = pool[Math.floor(random() * pool.length)];
    var from = tree.findNode(fromId);
    var wanted = TIER_UP[String(from.tier)];
    var options = (game._upgradeCatalog() || []).filter(function candidate(card) {
      return card && card.id !== "combine" && card.id !== fromId && tierOf(card) === wanted;
    });
    if (!options.length) return { ok: false, error: "No " + wanted + " badge is left to combine into." };
    var target = options[Math.floor(random() * options.length)];
    var kept = powersLevels(state)[fromId];
    delete powersLevels(state)[fromId];
    // The reward ledger counts picks as levels too (cuddle-skill-tree.js
    // powerLevel), so the old badge's entries are retired, as a sale does
    // (cuddle-shop.js): otherwise it still read as held.
    var history = Array.isArray(state.rewardBookHistory) ? state.rewardBookHistory : [];
    var retired = history.filter(function mine(entry) { return entry && (entry.id === fromId || entry.rewardId === fromId); });
    retired.forEach(function retire(entry) {
      entry.combinedId = fromId;
      if (entry.id === fromId) entry.id = fromId + ":combined";
      if (entry.rewardId === fromId) entry.rewardId = fromId + ":combined";
    });
    var granted = game._grantUpgradeChoice(Object.assign({}, target, { key: target.key || target.id }));
    if (!granted || granted.ok === false) {
      powersLevels(state)[fromId] = kept || 1;
      retired.forEach(function restore(entry) {
        if (entry.id === fromId + ":combined") entry.id = fromId;
        if (entry.rewardId === fromId + ":combined") entry.rewardId = fromId;
        delete entry.combinedId;
      });
      return { ok: false, error: "Improve couldn't finish: " + ((granted && granted.error) || "unknown error") };
    }
    return { ok: true, from: from.title, fromId: fromId, to: target.title || target.name, toId: target.id, toIcon: target.icon, tier: wanted };
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
    // Improve is offered only while it has something to raise.
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
    state.lastMessage = "Improve: " + result.from + " became " + result.to + " (" + result.tier + ").";
    playCombineFx(result);
    state.upgradeChoices = [];
    state.upgradePhase = null;
    state.upgradeMilestone = null;
    if (!special && typeof this._advanceRound === "function") this._advanceRound();
    save(this);
    return { ok: true, combined: result };
  };

  // -- Improve: the old badge turns into the new one ---------------------------
  // The old badge glows and shatters into sparks; the new one grows out of
  // the flash and the view zooms in on it. Tap anywhere to close early.
  var TIER_COLORS = { common: "#c98a4b", rare: "#c6d0de", epic: "#b98cff", legendary: "#f6c956" };
  var COMBINE_FX_MS = 3200;

  function escapeText(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch];
    });
  }

  function badgeFace(node, fallbackIcon, fallbackTitle, tier) {
    var tree = registry();
    var school = node && node.school && tree && tree.SCHOOLS ? tree.SCHOOLS[node.school] : null;
    var color = school ? school.color : ((tree && tree.SCHOOLLESS && tree.SCHOOLLESS.color) || "#9d97b0");
    var icon = (node && node.icon) || fallbackIcon || "✦";
    var Icons = window.CuddleIcons;
    var art = window.CuddleBadgeArt;
    var iconHtml = node && art && art.has(node.id) ? art.img(node.id)
      : Icons && Icons.hasEmoji(icon) ? Icons.svg(icon) : "<span>" + escapeText(icon) + "</span>";
    var rarity = String(tier || (node && node.tier) || "common");
    return '<div class="umt-cmb-badge" style="--t:' + color + ";--tier:" + (TIER_COLORS[rarity] || TIER_COLORS.common) + '">'
      + '<svg viewBox="0 0 100 116" aria-hidden="true"><path class="umt-cmb-hex" d="M50 2 L96 28 L96 88 L50 114 L4 88 L4 28 Z"/>'
      + '<path class="umt-cmb-line" d="M50 9 L90 32 L90 84 L50 107 L10 84 L10 32 Z"/></svg>'
      + '<span class="umt-cmb-icon">' + iconHtml + "</span>"
      + '<strong class="umt-cmb-name">' + escapeText((node && node.title) || fallbackTitle || "") + "</strong>"
      + '<small class="umt-cmb-tier">' + escapeText(rarity.charAt(0).toUpperCase() + rarity.slice(1)) + "</small></div>";
  }

  function playCombineFx(result) {
    if (typeof document === "undefined" || !document.body) return;
    var tree = registry();
    var fromNode = tree && tree.findNode(result.fromId);
    var toNode = tree && (tree.findNode(result.toId) || tree.findNodeByName(result.to));
    var layer = document.createElement("div");
    layer.className = "umt-cmb-layer";
    layer.setAttribute("role", "status");
    layer.setAttribute("aria-label", "Improve: " + result.from + " became " + result.to);
    layer.innerHTML = '<div class="umt-cmb-stage">'
      + '<div class="umt-cmb-old">' + badgeFace(fromNode, "", result.from) + "</div>"
      + '<div class="umt-cmb-flash" aria-hidden="true"></div>'
      + '<div class="umt-cmb-sparks" aria-hidden="true">' + Array.from({ length: 12 }, function spark(_v, i) {
        return '<i style="--a:' + (i * 30) + "deg;--d:" + ((i % 3) * 40) + 'ms"></i>';
      }).join("") + "</div>"
      + '<div class="umt-cmb-new">' + badgeFace(toNode, result.toIcon, result.to, result.tier) + "</div>"
      + "</div>"
      + '<p class="umt-cmb-caption"><b>Improve</b> ' + escapeText(result.from) + " → <em>" + escapeText(result.to) + "</em></p>";
    var close = function closeFx() {
      if (!layer.parentNode) return;
      layer.classList.add("is-leaving");
      setTimeout(function gone() { layer.remove(); }, 260);
    };
    layer.addEventListener("click", close);
    // After the reward screen re-renders under it.
    setTimeout(function show() {
      document.body.appendChild(layer);
      setTimeout(close, COMBINE_FX_MS);
    }, 30);
  }

  // A Duel's history also holds the AI's rows (actor "ai"): what looks at
  // "your last guess" or "your first guess" counts only the player's own.
  function playerRows(history) {
    return (Array.isArray(history) ? history : []).filter(function mine(entry) { return !entry || entry.actor !== "ai"; });
  }

  // -- hooks ----------------------------------------------------------------
  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithStrategies() {
    var state = this.state;
    var before = state && Array.isArray(state.history) ? state.history.length : 0;
    var result = baseSubmit.apply(this, arguments);
    state = this.state;
    var allRows = state && Array.isArray(state.history) ? state.history : [];
    if (!result || !result.ok || allRows.length <= before) return result;
    var history = playerRows(allRows);
    try {
      settleStrikes(this);
      var entry = history[history.length - 1];
      var solved = Boolean(entry && state.secret && entry.word === state.secret);
      var roller = Math.min(3, levelOf(this, "highRoller"));
      if (solved && roller > 0) {
        var bet = HIGH_ROLLER_BET[roller];
        var prize = HIGH_ROLLER_WIN[roller];
        // Won by guess 5 in world 1, guess 4 in worlds 2 and 3.
        var won = history.length <= HIGH_ROLLER_BY[worldIndex(this)];
        stageBonus(this, won ? prize : -bet, "umtHighRoller", won ? "High Roller won" : "High Roller lost");
        note(this, won ? "High Roller: bet " + bet + ", won +" + prize + "." : "High Roller: not solved by guess " + HIGH_ROLLER_BY[worldIndex(this)] + ", the " + bet + "-point bet is lost.");
      }
      var hard = Math.min(3, levelOf(this, "hardMode"));
      if (solved && hard > 0 && solvedInHardMode(history)) {
        if (stageBonus(this, HARD_MODE_POINTS[hard], "umtHardMode", "Hard Mode") > 0) {
          note(this, "Hard Mode: +" + HARD_MODE_POINTS[hard] + " points.");
        }
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
    HIGH_ROLLER_WIN: HIGH_ROLLER_WIN,
    HARD_MODE_POINTS: HARD_MODE_POINTS,
    followsHardMode: followsHardMode,
    combinable: function combinableIds(game) { return combinable(game); },
    leanPayout: leanPayout,
    leanBase: function leanBase(game) { return LEAN_BY_WORLD[worldIndex(game)]; },
    otherBadges: otherBadges,
    hasMonksVow: function hasMonksVow(game) { return levelOf(game, "monksVow") > 0; },
    // What a skip on the screen now open pays: { points, money, vow }.
    skipPay: skipPay,
    leanPerBadge: function leanPerBadge(game) { return LEAN_COST_BY_LEVEL[Math.max(1, Math.min(3, levelOf(game, "leanBuild"))) - 1]; }
  });
}());
