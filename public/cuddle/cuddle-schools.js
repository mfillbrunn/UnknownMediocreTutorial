/* Cuddle: schools of tile magic.
 *
 * Every badge belongs to a school (cuddle-skill-tree.js SCHOOLS): Flint,
 * Glass, Flora, Slate, Ingot, Brass or Pearl. Each level of a badge adds
 * its rarity's weight to its school (common 1, rare 2, epic 3, legendary
 * 5); a school's points unlock its three ranks (4 / 9 / 15, Pearl 3 / 6 /
 * 9), and each rank adds a perk. The ranks replaced the old two-badge
 * combos.
 *
 *   Flint  I solve by guess 3: +10   II +25            III +60
 *   Glass  I a grey vowel at start   II yellow hint after guess 2
 *                                    III green hint after guess 3
 *   Flora  I +1 lucky tile           II +1 idea tile, +1 mulligan
 *                                    III lucky tiles pay double
 *   Slate  I greys +1 point          II 1 consonant ruled out at start
 *                                    III greys +3, Cuddle Meter 2 sooner
 *   Ingot  I +$3 a solve             II +$8, Rainy Day cap +$10
 *                                    III +$20, first reward refresh free
 *   Brass  I quests +10              II +1 surprise quest a stage
 *                                    III quests +40 and +$5
 *   Pearl  I skips pay +10 more      II hard-mode solves +15, Lean Build
 *                                       ignores 3 badges
 *                                    III +30 a solve with 8 badges or fewer
 *
 * Perks that live inside another layer's effect (lucky and idea tiles,
 * the meter, Rainy Day, Lean Build) ask perk(game, name) for their number.
 * Ranks are read live from the badges, so they follow Combine too.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleSchools) return;
  var proto = Game.prototype;
  proto.__cuddleSchools = true;

  var FLINT_POINTS = [0, 10, 25, 60];
  var FLINT_BY = 3;
  var SLATE_GREY = [0, 1, 1, 3];
  var INGOT_MONEY = [0, 3, 8, 20];
  var BRASS_POINTS = [0, 10, 10, 40];
  var PEARL_SKIP = 10;
  var PEARL_HARD = 15;
  var PEARL_SOLVE = 30;
  var PEARL_MAX_BADGES = 8;
  var VOWELS = "AEIOU";

  function num(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function tree() {
    return window.CuddleSkillTree || null;
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  function ranks(game) {
    var registry = tree();
    var out = {};
    if (!registry || !game || !game.state || typeof registry.schoolPoints !== "function") return out;
    var points = registry.schoolPoints(game);
    registry.SCHOOL_ORDER.forEach(function each(id) {
      out[id] = registry.schoolRank(id, points[id]);
    });
    return out;
  }

  function rankOf(game, school) {
    if (!game || !game.state || inDuel(game.state)) return 0;
    return num(ranks(game)[school]);
  }

  // The numbers other layers read.
  function perk(game, name) {
    switch (name) {
      case "luckyTiles": return rankOf(game, "flora") >= 1 ? 1 : 0;
      case "ideaTiles": return rankOf(game, "flora") >= 2 ? 1 : 0;
      case "luckyMultiplier": return rankOf(game, "flora") >= 3 ? 2 : 1;
      case "meterSooner": return rankOf(game, "slate") >= 3 ? 2 : 0;
      case "interestCap": return rankOf(game, "ingot") >= 2 ? 10 : 0;
      case "leanIgnore": return rankOf(game, "pearl") >= 2 ? 3 : 0;
      default: return 0;
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
      return num(rebalance.addStageBonus(game, value, field, label));
    }
    game.state.score = num(game.state.score) + value;
    game.state.roundScore = num(game.state.roundScore) + value;
    return value;
  }

  function lateGuess(state) {
    var history = Array.isArray(state.history) ? state.history : [];
    var last = history[history.length - 1];
    return Boolean(last && num(last.latePenalty) > 0);
  }

  function payMoney(game, amount, label) {
    if (!amount || lateGuess(game.state)) return 0;
    game.state.cuddleMoney = Math.max(0, num(game.state.cuddleMoney) + amount);
    note(game, label + ": +$" + amount + ".");
    return amount;
  }

  function save(game) {
    try {
      if (typeof game.save === "function") game.save();
    } catch (_error) {
      // The next save picks it up.
    }
  }

  function badgeCount(game) {
    var registry = tree();
    if (!registry) return 0;
    var count = 0;
    registry.BRANCHES.forEach(function branch(group) {
      (group.nodes || []).forEach(function node(item) {
        if (item && item.type !== "combo" && registry.isOwned(game, item)) count += 1;
      });
    });
    return count;
  }

  // Rules a letter out the way Process of Elimination does: one not in
  // the answer, not known yet, preferably one in the deck.
  function ruleOut(game, vowels, label) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    if (!/^[A-Z]{5}$/.test(secret)) return null;
    var known = new Set(state.knownAbsent || []);
    var removed = new Set(state.removedLetters || []);
    var pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").filter(function fits(letter) {
      return (VOWELS.indexOf(letter) !== -1) === vowels && secret.indexOf(letter) === -1
        && !known.has(letter) && !removed.has(letter);
    });
    if (!pool.length) return null;
    var cards = [].concat(state.hand || [], state.deck || [], state.discard || []);
    var inDeck = new Set(cards.map(function glyph(card) { return String(card && (card.glyph || card.letter) || "").toUpperCase(); }));
    var useful = pool.filter(function held(letter) { return inDeck.has(letter); });
    var choices = useful.length ? useful : pool;
    var roll = typeof game.random === "function" ? game.random() : Math.random();
    var letter = choices[Math.floor(roll * choices.length)];
    state.knownAbsent = Array.from(known).concat([letter]).sort();
    if (window.CuddleHintFx && typeof window.CuddleHintFx.note === "function") window.CuddleHintFx.note(game, letter, label);
    note(game, label + ": " + letter + " is not in the answer.");
    return letter;
  }

  function hint(game, kind, label) {
    var debug = window.CuddleRebalanceV5 && window.CuddleRebalanceV5.debug;
    var grant = debug && (kind === "green" ? debug.grantGreenHint : debug.grantYellowHint);
    if (typeof grant !== "function") return false;
    try {
      return Boolean(grant(game, label));
    } catch (_error) {
      return false;
    }
  }

  function solvedInHardMode(history) {
    var strategies = window.CuddleStrategies;
    if (!strategies || typeof strategies.followsHardMode !== "function") return false;
    for (var i = 1; i < history.length; i += 1) {
      if (!strategies.followsHardMode(history[i] && history[i].word, history.slice(0, i))) return false;
    }
    return true;
  }

  // -- rank-ups --------------------------------------------------------------
  // Announced once each (the badge page shows the rest); a rank that needs
  // a one-time grant (Brass II's surprise quest) gets it here.
  function checkRanks(game, announce) {
    var state = game && game.state;
    var registry = tree();
    if (!state || !registry || inDuel(state)) return [];
    if (!state.umtSchools || typeof state.umtSchools !== "object") state.umtSchools = { seen: {} };
    var seen = state.umtSchools.seen || (state.umtSchools.seen = {});
    var now = ranks(game);
    var reached = [];
    registry.SCHOOL_ORDER.forEach(function each(id) {
      var before = num(seen[id]);
      var rank = num(now[id]);
      if (rank <= before) return;
      seen[id] = rank;
      for (var r = before + 1; r <= rank; r += 1) reached.push({ school: id, rank: r });
    });
    reached.forEach(function grant(step) {
      if (step.school === "brass" && step.rank === 2) {
        var economy = window.CuddleEconomyRarityV8;
        if (economy && typeof economy.applyEffect === "function") {
          try { economy.applyEffect("random-quest", game); } catch (_error) { /* no quest this time */ }
        }
      }
    });
    if (announce && reached.length) {
      var numeral = ["", "I", "II", "III"];
      state.synergyNotice = {
        icon: "✦",
        eyebrow: "School rank",
        title: reached.length === 1
          ? registry.SCHOOLS[reached[0].school].label + " " + numeral[reached[0].rank]
          : "School ranks reached",
        message: reached.map(function line(step) {
          var school = registry.SCHOOLS[step.school];
          return school.label + " " + numeral[step.rank] + ": " + school.perks[step.rank - 1] + ".";
        }).join(" ")
      };
    }
    return reached;
  }

  // -- hooks -----------------------------------------------------------------
  function wrap(name, build) {
    var original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = build(original);
  }

  ["chooseUpgrade", "_applyBossReward", "skipUpgrade"].forEach(function watch(name) {
    wrap(name, function build(original) {
      return function thenCheckRanks() {
        var result = original.apply(this, arguments);
        if (!result || result.ok !== false) {
          try { checkRanks(this, true); } catch (error) { console.warn("Cuddle schools:", error); }
        }
        return result;
      };
    });
  });

  wrap("_hydrateState", function build(original) {
    return function hydrateWithSchools() {
      var result = original.apply(this, arguments);
      try { checkRanks(this, false); } catch (_error) { /* checked again next stage */ }
      return result;
    };
  });

  // Stage start: Glass I, Slate II, Flora II's mulligan.
  wrap("_beginRound", function build(original) {
    return function beginRoundWithSchools() {
      var result = original.apply(this, arguments);
      var state = this.state;
      if (!state || state.status !== "playing" || inDuel(state)) return result;
      try {
        // A badge picked through a path that skips chooseUpgrade (packs,
        // the shop, playstyle powers) still ranks its school up here.
        checkRanks(this, true);
        var key = stageKey(state);
        if (!state.umtSchools) state.umtSchools = { seen: {} };
        if (state.umtSchools.stage === key) return result;
        state.umtSchools.stage = key;
        var now = ranks(this);
        if (num(now.glass) >= 1) ruleOut(this, true, "Glass");
        if (num(now.slate) >= 2) ruleOut(this, false, "Slate");
        if (num(now.flora) >= 2) {
          var gained = typeof this.mulliganGain === "function" ? this.mulliganGain(1) : 1;
          state.mulligansLeft = Math.max(0, num(state.mulligansLeft)) + gained;
        }
        save(this);
      } catch (error) {
        console.warn("Cuddle schools: a stage-start perk failed.", error);
      }
      return result;
    };
  });

  wrap("submitDraft", function build(original) {
    return function submitDraftWithSchools() {
      var state = this.state;
      var before = state && Array.isArray(state.history) ? state.history.length : 0;
      var result = original.apply(this, arguments);
      state = this.state;
      var history = state && Array.isArray(state.history) ? state.history : [];
      if (!result || !result.ok || history.length <= before || inDuel(state)) return result;
      try {
        var entry = history[history.length - 1];
        // A guess past the window earns nothing but its penalty.
        if (num(entry && entry.latePenalty) > 0) return result;
        var now = ranks(this);
        var solved = Boolean(entry && state.secret && entry.word === state.secret);
        var shown = Array.isArray(entry.shownFeedback) ? entry.shownFeedback : (entry.feedback || []);
        var greys = shown.filter(function grey(value) { return value === "grey"; }).length;
        var slate = num(now.slate);
        if (slate >= 1 && greys) stageBonus(this, greys * SLATE_GREY[Math.min(3, slate)], "umtSchoolSlate", "Slate · greys");
        var brass = num(now.brass);
        if (entry.questComplete && brass >= 1) {
          stageBonus(this, BRASS_POINTS[Math.min(3, brass)], "umtSchoolBrass", "Brass · quest");
          if (brass >= 3) payMoney(this, 5, "Brass");
        }
        if (solved) {
          var flint = num(now.flint);
          if (flint >= 1 && history.length <= FLINT_BY) {
            var fast = FLINT_POINTS[Math.min(3, flint)];
            if (stageBonus(this, fast, "umtSchoolFlint", "Flint · fast solve") > 0) note(this, "Flint: solved by guess " + FLINT_BY + ", +" + fast + " points.");
          }
          var ingot = num(now.ingot);
          if (ingot >= 1) payMoney(this, INGOT_MONEY[Math.min(3, ingot)], "Ingot");
          var pearl = num(now.pearl);
          if (pearl >= 2 && solvedInHardMode(history)) stageBonus(this, PEARL_HARD, "umtSchoolPearlHard", "Pearl · hard mode");
          if (pearl >= 3 && badgeCount(this) <= PEARL_MAX_BADGES) {
            if (stageBonus(this, PEARL_SOLVE, "umtSchoolPearl", "Pearl · lean") > 0) note(this, "Pearl: +" + PEARL_SOLVE + " points.");
          }
        } else if (state.status === "playing" || state.status === "questReward") {
          // Glass hints after guesses 2 and 3 (a quest reward screen may
          // be up; the stage goes on behind it).
          var glass = num(now.glass);
          if (glass >= 2 && history.length === 2) hint(this, "yellow", "Glass");
          if (glass >= 3 && history.length === 3) hint(this, "green", "Glass");
        }
        save(this);
      } catch (error) {
        console.warn("Cuddle schools: a perk failed after a guess.", error);
      }
      return result;
    };
  });

  // Pearl I: a skip pays +10 more.
  wrap("skipUpgrade", function build(original) {
    return function skipUpgradeWithPearl() {
      var result = original.apply(this, arguments);
      if (result && result.ok && rankOf(this, "pearl") >= 1) {
        this.state.score = num(this.state.score) + PEARL_SKIP;
        result.points = num(result.points) + PEARL_SKIP;
        note(this, "Pearl: +" + PEARL_SKIP + " points.");
        save(this);
      }
      return result;
    };
  });

  // Ingot III: the first refresh on each reward screen is free.
  wrap("getUpgradeRefreshCost", function build(original) {
    return function refreshCostWithIngot() {
      var cost = original.apply(this, arguments);
      if (cost === null || cost === undefined) return cost;
      if (num(this.state && this.state.upgradeRefreshesUsed) === 0 && rankOf(this, "ingot") >= 3) return 0;
      return cost;
    };
  });

  window.CuddleSchools = Object.freeze({
    ranks: ranks,
    rankOf: rankOf,
    perk: perk,
    checkRanks: checkRanks,
    badgeCount: badgeCount
  });
}());
