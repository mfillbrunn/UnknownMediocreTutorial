/* Cuddle: powers runtime.
 *
 * The power registry (cuddle-skill-tree.js) says what every power is: its
 * type, rarity, levels and what each level does. This file makes three
 * parts of that true:
 *
 *   1. Third-level bonuses. A power that can be taken more than once tops
 *      out at level 3, and the third pick is a bigger step than the first
 *      two. Powers whose effect reads a counter get the extra amount once,
 *      when they reach level 3 (THIRD_LEVEL below); the others have it in
 *      their own formula (Opening Verse, Colour Surge, Vowel Bounty, Rainy
 *      Day Fund, Treasure Hunter, Treasure Map and the tile unlocks, the
 *      culls).
 *
 *   2. Playstyle powers: Momentum, Big Opener, Last Stand, Pickpocket,
 *      Grace Period and Bold Opener. They join the reward pool here and
 *      change how a stage is played rather than adding a flat number.
 *
 *   3. More quest rewards: Rule Out, Vowel Check, Spotlight, Pocket Money,
 *      and Quick Points, alongside the existing ones.
 *
 * A power's level is the registry's level reader, so a power taken from a
 * reward screen, a pack or the shop all count the same.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddlePowers) return;
  var proto = Game.prototype;
  proto.__cuddlePowers = true;

  function num(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }

  function tree() {
    return window.CuddleSkillTree || null;
  }

  function levelOf(game, id) {
    var registry = tree();
    var node = registry && registry.findNode(id);
    return node && game ? registry.level(game, node) : 0;
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function powersState(state) {
    if (!state.umtPowers || typeof state.umtPowers !== "object") state.umtPowers = {};
    var powers = state.umtPowers;
    if (!powers.levels || typeof powers.levels !== "object") powers.levels = {};
    if (!Array.isArray(powers.thirdLevel)) powers.thirdLevel = [];
    return powers;
  }

  function save(game) {
    try {
      if (game && typeof game.save === "function") game.save();
    } catch (_error) {
      // The next save picks it up.
    }
  }

  function note(game, text) {
    var state = game.state;
    state.lastMessage = ((state.lastMessage || "") + " " + text).trim();
  }

  // Points that show in the cash-out's bonus box, named.
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

  // -------------------------------------------------------------------------
  // 1. Third-level bonuses
  // -------------------------------------------------------------------------

  function bump(object, key, amount) {
    if (!object || typeof object !== "object") return;
    object[key] = num(object[key]) + amount;
  }

  // The extra a power gets, once, on reaching level 3 -- on top of what
  // its third pick already added. (Registry levels in brackets.)
  var THIRD_LEVEL = {
    extraMulligans: function (state) { bump(state.upgrades, "extraMulligans", 1); }, // 1, 2, 4 mulligans
    questRefreshes: function (state) { bump(state.upgrades, "questRefreshes", 1); }, // 1, 2, 4 refreshes
    questPoints: function (state) { bump(state.upgrades, "questPoints", 10); }, // 10, 20, 40 points
    mulliganSize: function (state) { bump(state.upgrades, "mulliganSize", 3); }, // 4, 5, whole hand
    handSizeBoost: function (state) { bump(state.upgrades, "handSizeBonus", 1); }, // 1, 2, 4 consonants
    mulliganValueBoost: function (state) { bump(state.upgrades, "mulliganPointBonus", 10); }, // 5, 10, 25
    earlySolveBoost: function (state) { bump(state.upgrades, "earlyRoundPoint", 10); }, // 5, 10, 25
    "surprise-assignment": function (_state, game) { // 1, 2, 4 quests
      var economy = window.CuddleEconomyRarityV8;
      if (economy && typeof economy.applyEffect === "function") economy.applyEffect("random-quest", game);
    }
  };

  function grantThirdLevels(game) {
    var state = game && game.state;
    if (!state || inDuel(state)) return [];
    var powers = powersState(state);
    var granted = [];
    Object.keys(THIRD_LEVEL).forEach(function check(id) {
      if (powers.thirdLevel.indexOf(id) !== -1 || levelOf(game, id) < 3) return;
      powers.thirdLevel.push(id);
      try {
        THIRD_LEVEL[id](state, game);
        granted.push(id);
      } catch (error) {
        console.warn("Cuddle Powers: level 3 bonus failed for", id, error);
      }
    });
    if (granted.length) {
      var registry = tree();
      note(game, granted.map(function name(id) {
        var node = registry && registry.findNode(id);
        return (node ? node.title : id) + " reached level 3!";
      }).join(" "));
      save(game);
    }
    return granted;
  }

  // Wide Margins at level 3: the first refresh on each reward screen is free.
  var baseRefreshCost = proto.getUpgradeRefreshCost;
  if (typeof baseRefreshCost === "function") {
    proto.getUpgradeRefreshCost = function getUpgradeRefreshCostWithWideMargins() {
      var cost = baseRefreshCost.apply(this, arguments);
      if (cost === null || cost === undefined) return cost;
      // The first refresh is $3 (or $0 with Haggler); later ones cost more.
      if (levelOf(this, "wideChoice") >= 3 && cost === 3 && !this.hasHaggler()) return 0;
      return cost;
    };
  }

  // -------------------------------------------------------------------------
  // 2. Playstyle powers
  // -------------------------------------------------------------------------

  var NEW_POWERS = ["momentum", "bigOpener", "lastStand", "pickpocket", "gracePeriod", "boldOpener"];

  function powerCard(id) {
    var registry = tree();
    var node = registry && registry.findNode(id);
    if (!node) return null;
    return {
      id: id,
      key: id,
      icon: node.icon,
      title: node.title,
      name: node.title,
      description: node.description,
      tier: node.tier,
      rarity: node.tier,
      rewardTier: node.tier,
      __cuddleV8Tier: node.tier,
      kind: "upgrade",
      maxLevel: node.maxLevel
    };
  }

  var baseCatalog = proto._upgradeCatalog;
  proto._upgradeCatalog = function upgradeCatalogWithPowers() {
    var base = baseCatalog.apply(this, arguments);
    var list = Array.isArray(base) ? base.slice() : [];
    var registry = tree();
    var game = this;
    // Not at the start-of-run or milestone picks, which come from their own lists.
    var phase = this.state && this.state.upgradePhase;
    if (phase === "difficultyStart" || phase === "milestone") return list;
    NEW_POWERS.forEach(function add(id) {
      var node = registry && registry.findNode(id);
      if (!node || levelOf(game, id) >= node.maxLevel) return;
      if (list.some(function same(item) { return item && item.id === id; })) return;
      var card = powerCard(id);
      if (card) list.push(card);
    });
    return list;
  };

  function isNewPower(id) {
    return NEW_POWERS.indexOf(String(id || "")) !== -1;
  }

  function takePower(game, choice) {
    var state = game.state;
    var registry = tree();
    var node = registry && registry.findNode(choice.id);
    if (!node) return { ok: false, error: "Unknown upgrade." };
    var powers = powersState(state);
    var level = levelOf(game, choice.id);
    if (level >= node.maxLevel) return { ok: false, error: "That power is already at its top level." };
    powers.levels[choice.id] = level + 1;
    var special = state.upgradePhase === "difficultyStart" || state.upgradePhase === "milestone";
    state.lastMessage = node.title + (node.maxLevel > 1 ? " level " + (level + 1) : "") + " acquired.";
    state.upgradeChoices = [];
    state.upgradePhase = null;
    state.upgradeMilestone = null;
    if (!special && typeof game._advanceRound === "function") game._advanceRound();
    save(game);
    return { ok: true };
  }

  var baseChoose = proto.chooseUpgrade;
  proto.chooseUpgrade = function chooseUpgradeWithPowers(choiceKey) {
    var state = this.state;
    if (state && state.status === "upgrade") {
      var choice = (state.upgradeChoices || []).find(function match(item) { return item && item.key === choiceKey; });
      if (choice && isNewPower(choice.id)) return takePower(this, choice);
    }
    var result = baseChoose.apply(this, arguments);
    if (result && result.ok !== false) grantThirdLevels(this);
    return result;
  };

  // Packs, the shop and boss rewards hand out powers too.
  ["_grantUpgradeChoice", "buyCuddleShopItem", "buyUpgradePack", "_applyBossReward"].forEach(function wrap(name) {
    var original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = function withThirdLevels() {
      var result = original.apply(this, arguments);
      if (!result || result.ok !== false) grantThirdLevels(this);
      return result;
    };
  });

  function shownFeedback(entry) {
    var shown = entry && (Array.isArray(entry.shownFeedback) ? entry.shownFeedback : entry.feedback);
    return Array.isArray(shown) ? shown : [];
  }

  function countOf(feedback, colour) {
    return feedback.filter(function is(value) { return value === colour; }).length;
  }

  var MOMENTUM = [0, 4, 8, 15];
  var BIG_OPENER = [0, 4, 7, 16];
  var LAST_STAND = [0, 25, 45, 100];
  var PICKPOCKET = [0, 1, 2, 4];

  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithPowers() {
    var state = this.state;
    var before = state && Array.isArray(state.history) ? state.history.length : 0;
    var result = baseSubmit.apply(this, arguments);
    state = this.state;
    var history = state && Array.isArray(state.history) ? state.history : [];
    if (!result || !result.ok || history.length <= before || inDuel(state)) return result;
    try {
      var entry = history[history.length - 1];
      // A Spotlight that found no yellow places the first one that shows.
      if (state.umtSpotlightPending && state.umtSpotlightPending === spotlightKey(state) && state.status === "playing"
          && !(entry && entry.word === state.secret) && applySpotlight(this)) {
        note(this, state.umtSpotlightNote);
      }

      // A guess past the window earns nothing but its penalty.
      if (num(entry && entry.latePenalty) > 0) return result;
      var feedback = shownFeedback(entry);
      var greens = countOf(feedback, "green");

      var momentum = Math.min(3, levelOf(this, "momentum"));
      if (momentum > 0 && history.length >= 2) {
        var previous = countOf(shownFeedback(history[history.length - 2]), "green");
        if (greens > previous) stageBonus(this, MOMENTUM[momentum], "umtPowerMomentum", "Momentum");
      }

      var opener = Math.min(3, levelOf(this, "bigOpener"));
      var coloured = greens + countOf(feedback, "yellow");
      if (opener > 0 && history.length === 1 && coloured > 0) {
        stageBonus(this, coloured * BIG_OPENER[opener], "umtPowerBigOpener", "Big Opener");
      }

      var pickpocket = Math.min(3, levelOf(this, "pickpocket"));
      var yellows = countOf(feedback, "yellow");
      if (pickpocket > 0 && yellows > 0) {
        var cash = yellows * PICKPOCKET[pickpocket];
        state.cuddleMoney = Math.max(0, num(state.cuddleMoney) + cash);
        note(this, "Pickpocket: +$" + cash + ".");
      }

      var stand = Math.min(3, levelOf(this, "lastStand"));
      var solved = Boolean(entry && state.secret && entry.word === state.secret);
      if (stand > 0 && solved && typeof this._solveGuessThreshold === "function"
          && history.length === this._solveGuessThreshold()) {
        stageBonus(this, LAST_STAND[stand], "umtPowerLastStand", "Last Stand");
      }
    } catch (error) {
      console.warn("Cuddle Powers: a power failed after a guess.", error);
    }
    return result;
  };

  // Grace Period: the first late guess (two at level 2) costs nothing; at
  // level 3 the later ones cost half.
  var baseLatePenalty = proto._lateGuessPenalty;
  if (typeof baseLatePenalty === "function") {
    proto._lateGuessPenalty = function lateGuessPenaltyWithGrace(guess) {
      var penalty = baseLatePenalty.apply(this, arguments);
      var grace = Math.min(3, levelOf(this, "gracePeriod"));
      if (!(penalty > 0) || grace <= 0) return penalty;
      var number = Number.isFinite(Number(guess)) ? Number(guess) : num(this.state && this.state.guessesUsed) + 1;
      var over = number - this._solveGuessThreshold();
      if (over <= (grace >= 2 ? 2 : 1)) return 0;
      return grace >= 3 ? Math.ceil(penalty / 2) : penalty;
    };
  }

  // Bold Opener: every stage's first guess can be any five letters.
  var baseBegin = proto._beginRound;
  proto._beginRound = function beginRoundWithPowers() {
    var result = baseBegin.apply(this, arguments);
    var state = this.state;
    if (state && !inDuel(state)) {
      if (levelOf(this, "boldOpener") > 0) {
        state.buffs = Object.assign({}, state.buffs || {}, { sillyWord: Math.max(1, num(state.buffs && state.buffs.sillyWord)) });
      }
      grantThirdLevels(this);
    }
    return result;
  };

  // -------------------------------------------------------------------------
  // 3. Quest rewards
  // -------------------------------------------------------------------------

  var QUEST_REWARDS = [
    { id: "umtRuleOut", icon: "🚫", title: "Rule Out", description: "Two consonants in your hand (or your deck) that aren't in the answer are marked grey." },
    { id: "umtVowelCheck", icon: "🔤", title: "Vowel Check", description: "Learn whether two vowels you haven't tried are in the answer." },
    { id: "umtSpotlight", icon: "👁️", title: "Spotlight", description: "One yellow letter turns green: its exact place is shown. With no yellow yet, it waits for your next one." },
    { id: "umtPocketMoney", icon: "💰", title: "Pocket Money", description: "Gain $10 right now." },
    { id: "umtQuickPoints", icon: "⭐", title: "Quick Points", description: "Gain 15 points right now." }
  ];

  function uniqueSorted(list) {
    return Array.from(new Set(list)).sort();
  }

  function testedLetters(state) {
    var tested = new Set();
    (state.history || []).forEach(function each(entry) {
      String(entry && entry.word || "").toUpperCase().split("").forEach(function add(letter) { tested.add(letter); });
    });
    return tested;
  }

  function pick(game, list, count) {
    var random = typeof game.random === "function" ? game.random : Math.random;
    var pool = list.slice();
    var out = [];
    while (pool.length && out.length < count) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return out;
  }

  // Spotlight only ever turns a yellow into a green: a letter the board has
  // shown yellow, at a place no guess has shown green yet. It never finds
  // a letter the player hasn't, so it can't hand out more than one step.
  function spotlightKey(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  function applySpotlight(game) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    if (secret.length !== 5 || typeof game._syncInfiniteCards !== "function") return false;
    if (!Array.isArray(state.revealedPositions)) state.revealedPositions = [null, null, null, null, null];
    var yellow = new Set();
    var green = new Set();
    (state.history || []).forEach(function each(entry) {
      var word = String(entry && entry.word || "").toUpperCase();
      shownFeedback(entry).forEach(function mark(value, index) {
        if (value === "yellow") yellow.add(word[index]);
        if (value === "green") green.add(index);
      });
    });
    var spots = [];
    for (var index = 0; index < secret.length; index += 1) {
      if (!state.revealedPositions[index] && !green.has(index) && yellow.has(secret[index])) spots.push(index);
    }
    if (!spots.length) return false;
    var spot = pick(game, spots, 1)[0];
    state.revealedPositions[spot] = secret[spot];
    state.knownPresent = uniqueSorted((state.knownPresent || []).concat([secret[spot]]));
    state.umtSpotlightPending = null;
    game._syncInfiniteCards();
    if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
    state.umtSpotlightNote = "Spotlight: " + secret[spot] + " goes in position " + (spot + 1) + ".";
    return true;
  }

  var QUEST_EFFECTS = {
    // Two consonants that aren't in the answer, taken from the letters the
    // player can actually play -- the hand first, then the deck -- so the
    // grey marks are ones that matter.
    umtRuleOut: function ruleOut(game) {
      var state = game.state;
      var secret = String(state.secret || "").toUpperCase();
      var known = new Set((state.knownAbsent || []).concat(state.removedLetters || []));
      var tested = testedLetters(state);
      var useful = function useful(letter) {
        return /^[BCDFGHJKLMNPQRSTVWXYZ]$/.test(letter) && secret.indexOf(letter) === -1 && !known.has(letter) && !tested.has(letter);
      };
      var glyphs = function glyphs(cards) {
        return uniqueSorted((cards || []).map(function glyph(card) { return String(card && card.glyph || "").toUpperCase(); }).filter(useful));
      };
      var chosen = pick(game, glyphs(state.hand), 2);
      if (chosen.length < 2) {
        chosen = chosen.concat(pick(game, glyphs(state.deck).filter(function fresh(letter) { return chosen.indexOf(letter) === -1; }), 2 - chosen.length));
      }
      if (!chosen.length) return "Rule Out: none of your consonants can be ruled out.";
      state.knownAbsent = uniqueSorted((state.knownAbsent || []).concat(chosen));
      if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
      return "Rule Out: " + chosen.join(" and ") + " " + (chosen.length === 1 ? "is" : "are") + " not in the answer.";
    },
    umtVowelCheck: function vowelCheck(game) {
      var state = game.state;
      var secret = String(state.secret || "").toUpperCase();
      var tested = testedLetters(state);
      var known = new Set((state.knownAbsent || []).concat(state.knownPresent || []));
      var options = "AEIOU".split("").filter(function ok(letter) { return !tested.has(letter) && !known.has(letter); });
      var chosen = pick(game, options, 2);
      if (!chosen.length) return "Vowel Check: you've already tried every vowel.";
      var present = chosen.filter(function inWord(letter) { return secret.indexOf(letter) !== -1; });
      var absent = chosen.filter(function notInWord(letter) { return secret.indexOf(letter) === -1; });
      if (present.length) state.knownPresent = uniqueSorted((state.knownPresent || []).concat(present));
      if (absent.length) state.knownAbsent = uniqueSorted((state.knownAbsent || []).concat(absent));
      return "Vowel Check: "
        + (present.length ? present.join(" and ") + (present.length === 1 ? " is" : " are") + " in the answer" : "")
        + (present.length && absent.length ? "; " : "")
        + (absent.length ? absent.join(" and ") + (absent.length === 1 ? " isn't" : " aren't") + (present.length ? "" : " in the answer") : "")
        + ".";
    },
    umtSpotlight: function spotlight(game) {
      if (applySpotlight(game)) return game.state.umtSpotlightNote;
      game.state.umtSpotlightPending = spotlightKey(game.state);
      return "Spotlight: no yellow letter yet. Your next yellow will be placed.";
    },
    umtPocketMoney: function pocketMoney(game) {
      game.state.cuddleMoney = Math.max(0, num(game.state.cuddleMoney) + 10);
      return "Pocket Money: +$10.";
    },
    umtQuickPoints: function quickPoints(game) {
      stageBonus(game, 15, "umtQuestQuickPoints", "Quick Points");
      return "Quick Points: +15 points.";
    }
  };

  var baseReward = proto._applyRewardEffect;
  proto._applyRewardEffect = function applyRewardEffectWithPowers(rewardId) {
    var effect = QUEST_EFFECTS[rewardId];
    if (effect && this.state) {
      try {
        var message = effect(this);
        save(this);
        return message;
      } catch (error) {
        console.warn("Cuddle Powers: quest reward failed", rewardId, error);
        return "That reward couldn't be used right now.";
      }
    }
    return baseReward.apply(this, arguments);
  };

  // The quest book draws reward choices from its own list; the new ones
  // join it here, the way cuddle-campaign.js adds Category Whisper.
  function installQuestRewards() {
    var book = window.CuddleQuestBook;
    if (!book || book.__cuddlePowersRewards) return;
    var previousChoices = book.rewardChoices;
    var previousGet = book.getReward;
    var extra = QUEST_REWARDS.map(function copy(item) { return Object.freeze(Object.assign({}, item)); });
    function getReward(id) {
      var mine = extra.find(function match(item) { return item.id === id; });
      return mine ? Object.assign({}, mine) : (typeof previousGet === "function" ? previousGet(id) : null);
    }
    // The existing draw picks from its own list (it knows when Category
    // Whisper is useless); the new rewards are shuffled in alongside.
    function rewardChoices(count, random) {
      var wanted = Math.max(0, Math.floor(num(count, 3)));
      var draw = typeof random === "function" ? random : Math.random;
      var base = typeof previousChoices === "function" ? previousChoices(99, draw) : [];
      var pool = base.concat(extra.map(function copy(item) { return Object.assign({}, item); }));
      for (var index = pool.length - 1; index > 0; index -= 1) {
        var swap = Math.floor(draw() * (index + 1));
        var held = pool[index];
        pool[index] = pool[swap];
        pool[swap] = held;
      }
      return pool.slice(0, wanted);
    }
    window.CuddleQuestBook = Object.freeze(Object.assign({}, book, {
      REWARDS: Object.freeze((Array.isArray(book.REWARDS) ? book.REWARDS : []).concat(extra)),
      getReward: getReward,
      rewardChoices: rewardChoices,
      __cuddlePowersRewards: true
    }));
  }
  installQuestRewards();

  window.CuddlePowers = Object.freeze({
    NEW_POWERS: NEW_POWERS.slice(),
    QUEST_REWARDS: QUEST_REWARDS.map(function copy(item) { return Object.assign({}, item); }),
    level: levelOf,
    grantThirdLevels: grantThirdLevels
  });

  // -------------------------------------------------------------------------
  // One read-only index of the game's content, from the lists that own it:
  // powers (the registry), quest rewards and the boss / challenge rules
  // (the quest book's CONSTRAINTS). audit() checks that every power the
  // game can offer is in the registry with a type and at most 3 levels.
  // -------------------------------------------------------------------------
  function powersList() {
    var registry = tree();
    if (!registry) return [];
    var out = [];
    registry.BRANCHES.forEach(function each(branch) {
      branch.nodes.forEach(function node(item) {
        if (item.type === "combo") return;
        out.push({ id: item.id, title: item.title, type: item.type, tier: item.tier, maxLevel: item.maxLevel || 1,
          levels: Array.isArray(item.levels) ? item.levels.slice() : null, source: branch.id });
      });
    });
    return out;
  }

  function audit(game) {
    var registry = tree();
    if (!registry || !game || typeof game._upgradeCatalog !== "function") return [];
    var problems = [];
    var offered = [];
    try { offered = game._upgradeCatalog() || []; } catch (_error) { offered = []; }
    var economy = window.CuddleEconomyRarityV8;
    try {
      if (economy && typeof economy.legendaryChoices === "function") offered = offered.concat(economy.legendaryChoices(game, 99, "audit"));
    } catch (_error) { /* nothing more to check */ }
    offered.forEach(function check(card) {
      var node = registry.resolve(card.id) || registry.findNodeByName(card.title || card.name);
      if (!node) problems.push((card.title || card.id) + ": not in the power registry");
      else if (!registry.TYPES[node.type]) problems.push(node.title + ": no type");
    });
    powersList().forEach(function caps(item) {
      if (item.maxLevel > 3) problems.push(item.title + ": more than 3 levels");
      if (item.levels && item.levels.length !== item.maxLevel) problems.push(item.title + ": level text doesn't match its levels");
    });
    if (problems.length) console.warn("Cuddle Catalog audit:", problems);
    return problems;
  }

  window.CuddleCatalog = Object.freeze({
    types: function types() { var registry = tree(); return registry ? registry.TYPES : {}; },
    powers: powersList,
    questRewards: function questRewards() {
      var book = window.CuddleQuestBook;
      return book && Array.isArray(book.REWARDS) ? book.REWARDS.map(function copy(item) { return Object.assign({}, item); }) : [];
    },
    rules: function rules() {
      var book = window.CuddleQuestBook;
      return book && Array.isArray(book.CONSTRAINTS) ? book.CONSTRAINTS.map(function copy(item) { return Object.assign({}, item); }) : [];
    },
    audit: audit
  });
}());
