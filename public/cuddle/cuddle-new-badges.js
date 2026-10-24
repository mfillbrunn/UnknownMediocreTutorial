/* Cuddle: twelve badges that fill out the schools.
 *
 * Restraint
 *   Clean Slate (legendary)  skipping a reward also levels up one of your
 *                            badges at random.
 *   Ascetic (legendary)      every solved stage pays 2x its points with 5
 *                            non-Restraint badges or fewer, 1.5x with 10
 *                            or fewer.
 * Quests
 *   Quest Mastery (legendary) every quest reward is one step bigger (2
 *                            mulligans instead of 1, 3 vowels checked
 *                            instead of 2, ...).
 *   Overtime (epic)          adds the Overtime quest reward, always on
 *                            offer: 1 more guess this stage (a boss fight
 *                            runs a guess longer; on other stages the
 *                            late-guess cost starts later).
 *   Quest Chain (legendary)  each quest finished puts a random quest on
 *                            the next guess (if it has none), so quests
 *                            can chain on.
 *   Quest Scout (rare, 2)    when a quest appears, a word from the hand
 *                            that fulfills it is found but kept hidden: 1
 *                            (2) of its letters is shown in its spot.
 * Money
 *   Black Market (legendary) every reward screen sells a random badge for
 *                            $50, on top of the pick.
 *   Treasure Chest (legendary) opens a free Large Pack; no other power.
 *   Insert Coin (epic, 2)    out of guesses in a boss or strict stage: pay
 *                            $100 ($75) for 1 more guess.
 *   Golden Ledger (epic, 2)  money counts toward a boss's points gate,
 *                            $1 = 0.5 points (1 point); it isn't spent.
 * Speed
 *   Fast Lane (epic, 3)      every boss, challenge and curse starts 1 / 2 /
 *                            3 guesses later: none is removed, its guesses
 *                            just come after the clear opening ones (the shift itself is
 *                            applied in cuddle-engine.js and
 *                            cuddle-rebalance-v5.js through freeOpeners).
 *   Golden Opener (legendary) every yellow in the 1st guess moves to its
 *                            spot (turns green).
 *
 * The badges live in the registry (cuddle-skill-tree.js) and join the
 * reward pool through cuddle-powers.js NEW_POWERS.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleNewBadges) return;
  var proto = Game.prototype;
  proto.__cuddleNewBadges = true;

  // Ascetic: [most badges outside Restraint, what a solve's points are
  // multiplied by], fewest first.
  var ASCETIC_TIERS = [[5, 1.6], [10, 1.3]];
  // Black Market's price by its level.
  var MARKET_PRICES = [50, 45, 40];
  function marketPrice(game) {
    return MARKET_PRICES[Math.max(1, Math.min(3, levelOf(game, "blackMarket"))) - 1];
  }
  var COIN_PRICES = [0, 100, 75];
  var LEDGER_RATES = [0, 0.5, 1];
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
    if (!node || !game || !game.state) return 0;
    try {
      return Math.max(0, Math.floor(num(tree.level(game, node))));
    } catch (_error) {
      return 0;
    }
  }

  // In a Duel too: what can't happen there (Overtime's extra guess, the
  // Treasure Chest's pack) checks for one itself.
  function has(game, id) {
    return levelOf(game, id) > 0;
  }

  function randomOf(game) {
    return typeof game.random === "function" ? game.random : Math.random;
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

  function save(game) {
    try {
      if (typeof game.save === "function") game.save();
    } catch (_error) {
      // The next save picks it up.
    }
  }

  function refreshUi() {
    try {
      window.dispatchEvent(new Event("cuddle:campaign-update"));
    } catch (_error) {
      // Rendering catches up on the next interaction.
    }
    schedulePaint();
  }

  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  function isBoss(game) {
    return typeof game.isBossRound === "function" && game.isBossRound();
  }

  function uniqueSorted(list) {
    return Array.from(new Set(list)).sort();
  }

  // Badges you hold: every registry power with a level, combos left out.
  function badgeCount(game) {
    var tree = registry();
    if (!tree || !Array.isArray(tree.BRANCHES)) return 0;
    var count = 0;
    tree.BRANCHES.forEach(function branch(group) {
      (group.nodes || []).forEach(function node(item) {
        // Restraint's own badges (Ascetic included) and Legendaries (which
        // can't be skipped) don't count.
        if (!item || item.type === "combo" || item.school === "pearl" || item.tier === "legendary") return;
        try {
          if (num(tree.level(game, item)) > 0) count += 1;
        } catch (_error) {
          // An unreadable badge doesn't count.
        }
      });
    });
    return count;
  }

  // What Ascetic multiplies a solve by right now: 2, 1.5, or 1 (nothing).
  // Level 2 widens both thresholds: 6 and 12 badges.
  var ASCETIC_TIERS_2 = [[6, 1.6], [12, 1.3]];
  function asceticTiers(game) {
    return levelOf(game, "ascetic") >= 2 ? ASCETIC_TIERS_2 : ASCETIC_TIERS;
  }

  function asceticMultiplier(game) {
    var count = badgeCount(game);
    var tiers = asceticTiers(game);
    for (var i = 0; i < tiers.length; i += 1) {
      if (count <= tiers[i][0]) return tiers[i][1];
    }
    return 1;
  }

  // ---------------------------------------------------------------------------
  // Fast Lane
  // ---------------------------------------------------------------------------

  function freeOpeners(game) {
    if (!game || !game.state || inDuel(game.state)) return 0;
    return Math.min(3, levelOf(game, "fastLane"));
  }

  // ---------------------------------------------------------------------------
  // Clean Slate
  // ---------------------------------------------------------------------------

  // A badge you hold that can still go up a level, taken through the same
  // path a reward pick uses.
  function levelUpRandomBadge(game) {
    var tree = registry();
    if (!tree || typeof game._upgradeCatalog !== "function" || typeof game._grantUpgradeChoice !== "function") return null;
    var catalog = (game._upgradeCatalog() || []).filter(function owned(card) {
      if (!card || card.id === "combine" || card.id === "treasureChest") return false;
      var node = tree.findNode(card.key || card.id) || (typeof tree.findNodeByName === "function" ? tree.findNodeByName(card.title) : null);
      if (!node || node.type === "combo") return false;
      var level = num(tree.level(game, node));
      return level > 0 && level < num(node.maxLevel || 1);
    });
    var random = randomOf(game);
    while (catalog.length) {
      var card = catalog.splice(Math.floor(random() * catalog.length), 1)[0];
      var result = null;
      try {
        result = game._grantUpgradeChoice(Object.assign({}, card, { key: card.key || card.id }));
      } catch (_error) {
        result = null;
      }
      if (result && result.ok !== false) return card.title || card.name || card.id;
    }
    return null;
  }

  function cleanSlateCount(game) {
    return levelOf(game, "cleanSlate") >= 2 ? 2 : 1;
  }

  var baseSkip = proto.skipUpgrade;
  if (typeof baseSkip === "function") {
    proto.skipUpgrade = function skipUpgradeWithCleanSlate() {
      var slate = has(this, "cleanSlate");
      var result = baseSkip.apply(this, arguments);
      if (!slate || !result || result.ok === false) return result;
      // Level 2: two badges go up.
      var titles = [];
      for (var turn = 0; turn < cleanSlateCount(this); turn += 1) {
        var raised = levelUpRandomBadge(this);
        if (raised) titles.push(raised);
      }
      var title = titles.join(" and ");
      note(this, title ? "Clean Slate: " + title + (titles.length > 1 ? " went up a level each." : " went up a level.") : "Clean Slate: none of your badges can go higher.");
      save(this);
      return Object.assign({}, result, { cleanSlate: title });
    };
  }

  // ---------------------------------------------------------------------------
  // Quest Mastery
  // ---------------------------------------------------------------------------

  // What each quest reward says once it's a step bigger.
  var MASTERED_TEXT = {
    stealthGuess: "+4 mulligans for this stage.",
    letterProbe: "3 random consonants from your hand: you see how many times each one is in the answer.",
    sillyWord: "Your next guess can be any 5 letters, even if it isn't a real word. Also +1 mulligan.",
    extraLetters: "+4 more consonants in your hand for your next guess.",
    jokerToken: "+2 Joker cards: cards that can be any letter. They stay until you use them.",
    revealCategory: "Shows 2 more of the answer's themes",
    umtRuleOut: "3 consonants in your hand that aren't in the answer turn grey, and are swapped for new cards.",
    umtVowelCheck: "3 vowels you haven't tried are tested: you learn if each one is in the answer.",
    umtSpotlight: "2 yellow letters move to their exact spots and turn green (or the next ones you find do).",
    umtPocketMoney: "Get +$16 right now.",
    umtQuickPoints: "Get +20 points right now.",
    umtFishingLine: "3 times this stage, take a card back from your discard pile (tap the hook on your deck).",
    umtOvertime: "Two more guesses this stage: a boss gives you two more tries; elsewhere the late-guess cost starts two guesses later.",
    // Clue: yellow hints, or green ones with Quest Clue at level 2.
    umtClue: function clueText(game) {
      return levelOf(game, "questClue") >= 2
        ? "Two green hints: two letters in their exact spots."
        : "Two yellow hints: two letters that are in the answer.";
    }
  };

  function masterChoices(game) {
    var state = game && game.state;
    if (!state || state.status !== "questReward" || !has(game, "questMastery")) return;
    (state.questRewardChoices || []).forEach(function upgrade(choice) {
      if (!choice || choice.umtMastered || !MASTERED_TEXT[choice.id]) return;
      var text = MASTERED_TEXT[choice.id];
      choice.description = typeof text === "function" ? text(game) : text;
      choice.umtMastered = true;
    });
  }

  // One more consonant from the hand, counted (Letter Count's third).
  function countOneMore(game) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    var known = new Set((state.knownPresent || []).concat(state.knownAbsent || []));
    var options = uniqueSorted((state.hand || []).map(function glyph(card) {
      return String(card && card.glyph || "").toUpperCase();
    }).filter(function consonant(letter) {
      return /^[A-Z]$/.test(letter) && VOWELS.indexOf(letter) === -1 && !known.has(letter);
    }));
    if (!options.length) return "";
    var letter = options[Math.floor(randomOf(game)() * options.length)];
    var count = secret.split("").filter(function same(value) { return value === letter; }).length;
    if (count) state.knownPresent = uniqueSorted((state.knownPresent || []).concat([letter]));
    else state.knownAbsent = uniqueSorted((state.knownAbsent || []).concat([letter]));
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
    if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
    return letter + "×" + count;
  }

  function oneMoreExtraLetter(game) {
    var state = game.state;
    if (typeof game._baseDeckGlyphs !== "function" || typeof game._newCard !== "function") return "";
    var inHand = new Set((state.hand || []).map(function glyph(card) { return card && card.glyph; }));
    var pool = game._baseDeckGlyphs().filter(function fresh(glyph) {
      return !inHand.has(glyph) && !(typeof game.isInfiniteGlyph === "function" && game.isInfiniteGlyph(glyph));
    });
    if (!pool.length) return "";
    var glyph = pool[Math.floor(randomOf(game)() * pool.length)];
    state.hand.push(game._newCard(glyph, "extra"));
    return glyph;
  }

  var TWICE = { stealthGuess: true, jokerToken: true, revealCategory: true };

  var baseReward = proto._applyRewardEffect;
  proto._applyRewardEffect = function applyRewardEffectWithMastery(rewardId) {
    if (!has(this, "questMastery")) return baseReward.apply(this, arguments);
    var game = this;
    game.__umtQuestBoost = true;
    try {
      var message = baseReward.apply(this, arguments);
      if (TWICE[rewardId]) {
        var again = baseReward.apply(this, arguments);
        return [message, again].filter(Boolean).join(" ") + " (Quest Mastery: twice.)";
      }
      if (rewardId === "letterProbe") {
        var extra = countOneMore(game);
        return extra ? String(message || "").replace(/\.$/, "") + ", " + extra + " (Quest Mastery)." : message;
      }
      if (rewardId === "extraLetters") {
        var glyph = oneMoreExtraLetter(game);
        return glyph ? String(message || "").replace(/ added/, ", " + glyph + " added") : message;
      }
      if (rewardId === "sillyWord" && typeof game.mulliganGain === "function") {
        var gained = game.mulliganGain(1);
        game.state.mulligansLeft = num(game.state.mulligansLeft) + gained;
        return message + " Quest Mastery: +" + gained + " mulligan" + (gained === 1 ? "" : "s") + ".";
      }
      return message;
    } finally {
      game.__umtQuestBoost = false;
    }
  };

  ["refreshQuestRewards", "chooseQuestReward"].forEach(function wrap(name) {
    var base = proto[name];
    if (typeof base !== "function") return;
    proto[name] = function thenMasterChoices() {
      var result = base.apply(this, arguments);
      masterChoices(this);
      return result;
    };
  });

  // ---------------------------------------------------------------------------
  // Overtime
  // ---------------------------------------------------------------------------

  function overtimeBonus(game) {
    var state = game && game.state;
    var record = state && state.umtOvertime;
    return record && record.key === stageKey(state) ? num(record.extra) : 0;
  }

  // The Overtime quest reward (the badge adds it to the quest rewards, see
  // cuddle-powers.js): one more guess this stage. A boss fight's guess cap
  // grows with it; elsewhere _solveGuessThreshold reads the count.
  function grantOvertime(game) {
    var state = game && game.state;
    if (!state || inDuel(state)) return false;
    var key = stageKey(state);
    var record = state.umtOvertime && state.umtOvertime.key === key ? state.umtOvertime : { key: key, extra: 0 };
    record.extra = num(record.extra) + 1;
    state.umtOvertime = record;
    if (isBoss(game)) state.maxGuesses = Math.max(1, num(state.maxGuesses) || 6) + 1;
    return true;
  }

  var baseThreshold = proto._solveGuessThreshold;
  if (typeof baseThreshold === "function") {
    proto._solveGuessThreshold = function solveGuessThresholdWithOvertime() {
      return baseThreshold.apply(this, arguments) + overtimeBonus(this);
    };
  }

  // ---------------------------------------------------------------------------
  // Quest Chain
  // ---------------------------------------------------------------------------

  // A quest finished on the latest guess books one for the guess after it.
  function bookQuestChain(game) {
    var state = game.state;
    if (!has(game, "questChain")) return;
    var history = playerRows(state.history);
    var entry = history[history.length - 1];
    if (!entry || !entry.questComplete || entry.umtQuestChain) return;
    entry.umtQuestChain = true;
    state.umtQuestChain = { key: stageKey(state), guess: history.length + 1 };
    // The next guess's quest has already been settled by now; if a quest
    // reward screen is open, it lands once play resumes.
    placeChainedQuest(game);
  }

  // The booked guess gets a random quest, unless it already has one.
  function placeChainedQuest(game) {
    var state = game.state;
    var booked = state && state.umtQuestChain;
    if (!booked || state.status !== "playing") return;
    if (booked.key !== stageKey(state) || booked.guess !== num(state.guessesUsed) + 1) return;
    state.umtQuestChain = null;
    if (state.activeQuest || !has(game, "questChain")) return;
    if (typeof game._effectiveMaxGuesses === "function" && booked.guess > game._effectiveMaxGuesses()) return;
    var book = window.CuddleQuestBook;
    if (!book || typeof book.createQuest !== "function") return;
    var quest = book.createQuest({
      feasibleWords: game.getFeasibleWords(),
      secret: state.secret,
      history: state.history,
      knownAbsent: state.knownAbsent,
      knownPresent: state.knownPresent,
      revealedPositions: state.revealedPositions,
      rareLetters: typeof game.getRareLetters === "function" ? game.getRareLetters() : [],
      random: randomOf(game)
    });
    if (!quest) return;
    state.activeQuest = quest;
    if (state.megaState && typeof state.megaState === "object") state.megaState.activeQuests = [quest];
    state.activeQuests = [quest];
    note(game, "Quest Chain: a new quest for this guess.");
  }

  // ---------------------------------------------------------------------------
  // Insert Coin: out of guesses
  // ---------------------------------------------------------------------------

  function coinPrice(game) {
    var level = Math.min(2, levelOf(game, "insertCoin"));
    return level > 0 ? COIN_PRICES[level] : 0;
  }

  // Second Cup (a free rescue row) goes first.
  function secondCupReady(state) {
    var coach = state && state.cuddleCoachExpansion;
    return Boolean(coach && Array.isArray(coach.newBossRewardsOwned)
      && coach.newBossRewardsOwned.indexOf("secondCup") !== -1 && !coach.secondCupUsed);
  }

  var baseResolve = proto._resolvePendingRoundEnd;
  proto._resolvePendingRoundEnd = function resolvePendingRoundEndWithNewBadges() {
    var state = this.state;
    var pending = state && state.pendingRoundEnd;
    if (!pending || inDuel(state)) return baseResolve.apply(this, arguments);

    // Overtime picked as the reward for a quest finished on the guess that
    // ran out: the stage isn't over after all.
    if (pending.type === "outOfGuesses" && overtimeBonus(this) > 0) {
      var limit = typeof this._hardGuessLimit === "function" ? this._hardGuessLimit() : Infinity;
      if (num(state.guessesUsed) < limit) {
        state.pendingRoundEnd = null;
        state.status = "playing";
        if (typeof this._ensureQuestForNextGuess === "function") this._ensureQuestForNextGuess();
        save(this);
        return undefined;
      }
    }

    // Insert Coin: ask before the stage is lost.
    var price = coinPrice(this);
    if (pending.type === "outOfGuesses" && price > 0 && !this.__umtCoinDeclined && !secondCupReady(state)
        && num(state.cuddleMoney) >= price) {
      state.umtCoinOffer = { price: price, pending: pending, key: stageKey(state) };
      state.pendingRoundEnd = null;
      state.status = "playing";
      save(this);
      refreshUi();
      return undefined;
    }

    return baseResolve.apply(this, arguments);
  };

  // Golden Ledger: what the money is worth toward a boss's points gate
  // (cuddle-branch-map.js adds it to every gate comparison). Not spent.
  function ledgerRate(game) {
    if (!game || !game.state || inDuel(game.state)) return 0;
    return LEDGER_RATES[Math.min(2, levelOf(game, "goldenLedger"))] || 0;
  }
  function ledgerCredit(game) {
    var rate = ledgerRate(game);
    return rate > 0 ? Math.floor(Math.max(0, num(game.state.cuddleMoney)) * rate) : 0;
  }

  proto.umtAcceptCoin = function umtAcceptCoin() {
    var state = this.state;
    var offer = state && state.umtCoinOffer;
    if (!offer) return { ok: false, error: "There's nothing to pay for." };
    if (num(state.cuddleMoney) < offer.price) return this.umtDeclineCoin();
    state.cuddleMoney = num(state.cuddleMoney) - offer.price;
    state.umtCoinOffer = null;
    if (isBoss(this)) {
      state.maxGuesses = Math.max(1, num(state.maxGuesses) || 6) + 1;
    } else {
      // A strict stage's limit is the world's window; raise it the way
      // Second Cup's rescue row does (cuddle-coach-expansion.js).
      var key = String(state.round || 0) + ":" + String(state.secret || "");
      var rescue = state.umtRescueRows;
      state.umtRescueRows = { key: key, rows: (rescue && rescue.key === key ? num(rescue.rows) : 0) + 1 };
    }
    state.failureReason = null;
    state.lastMessage = "Insert Coin: -$" + offer.price + ", one more guess.";
    if (typeof this._ensureQuestForNextGuess === "function") this._ensureQuestForNextGuess();
    save(this);
    refreshUi();
    return { ok: true, spent: offer.price };
  };

  proto.umtDeclineCoin = function umtDeclineCoin() {
    var state = this.state;
    var offer = state && state.umtCoinOffer;
    if (!offer) return { ok: false };
    state.umtCoinOffer = null;
    state.pendingRoundEnd = offer.pending;
    this.__umtCoinDeclined = true;
    try {
      this._resolvePendingRoundEnd();
    } finally {
      this.__umtCoinDeclined = false;
    }
    save(this);
    refreshUi();
    return { ok: true };
  };

  // ---------------------------------------------------------------------------
  // Black Market
  // ---------------------------------------------------------------------------

  function marketKey(state) {
    return stageKey(state) + ":" + (state.upgradePhase || "") + ":" + (state.upgradeChoices || []).map(function id(card) {
      return card && (card.key || card.id);
    }).join(",");
  }

  function marketOffer(game) {
    var state = game && game.state;
    if (!state || state.status !== "upgrade" || !has(game, "blackMarket")) return null;
    if (!Array.isArray(state.upgradeChoices) || !state.upgradeChoices.length) return null;
    if (state.umtMarketBought === marketKey(state)) return null;
    var wallet = num(state.cuddleMoney);
    var price = marketPrice(game);
    return { price: price, wallet: wallet, affordable: wallet >= price };
  }

  proto.buyRandomBadge = function buyRandomBadge() {
    var state = this.state;
    var offer = marketOffer(this);
    if (!offer) return { ok: false, error: "The Black Market has nothing for sale right now." };
    if (!offer.affordable) return { ok: false, error: "You need $" + offer.price + "." };
    if (typeof this._upgradeCatalog !== "function" || typeof this._grantUpgradeChoice !== "function") {
      return { ok: false, error: "The Black Market is closed." };
    }
    var key = marketKey(state);
    var pool = (this._upgradeCatalog() || []).filter(function sellable(card) {
      return card && card.id !== "combine" && card.id !== "blackMarket";
    });
    var random = randomOf(this);
    while (pool.length) {
      var card = pool.splice(Math.floor(random() * pool.length), 1)[0];
      var result = null;
      try {
        result = this._grantUpgradeChoice(Object.assign({}, card, { key: card.key || card.id }));
      } catch (_error) {
        result = null;
      }
      if (result && result.ok !== false) {
        state.cuddleMoney = num(state.cuddleMoney) - offer.price;
        state.umtMarketBought = key;
        var title = card.title || card.name || card.id;
        state.lastMessage = "Black Market: " + title + " for $" + offer.price + ".";
        save(this);
        return { ok: true, message: state.lastMessage, spent: offer.price, badge: title };
      }
    }
    return { ok: false, error: "There's no badge left to buy." };
  };

  // ---------------------------------------------------------------------------
  // Treasure Chest
  // ---------------------------------------------------------------------------

  // The free pack waits for the map, and for any other pack to close.
  function maybeGiftChest(game) {
    var state = game && game.state;
    if (!state || inDuel(state) || !has(game, "treasureChest")) return;
    // One free pack per level (an old save's true counts as one given).
    var given = state.umtTreasureChestGiven === true ? 1 : num(state.umtTreasureChestGiven);
    if (given >= levelOf(game, "treasureChest")) return;
    if (state.status !== "branchMap" || state.umtPackOffer) return;
    state.umtTreasureChestGiven = given + 1;
    var world = Array.isArray(state.bossGatesDone) ? state.bossGatesDone.length : 0;
    state.umtPackOffer = {
      id: (state.runId || "run") + ":treasure-chest" + (given ? ":" + (given + 1) : ""),
      size: "large",
      price: 0,
      world: Math.min(3, world + 1),
      cards: null,
      gift: true,
      giftTitle: "Treasure Chest",
      giftKicker: "Legendary badge"
    };
    save(game);
    refreshUi();
  }

  ["_advanceRound", "closeUpgradePack", "chooseUpgrade"].forEach(function wrap(name) {
    var base = proto[name];
    if (typeof base !== "function") return;
    proto[name] = function thenTreasureChest() {
      var result = base.apply(this, arguments);
      try {
        maybeGiftChest(this);
      } catch (error) {
        console.warn("Cuddle new badges: Treasure Chest failed.", error);
      }
      return result;
    };
  });

  // ---------------------------------------------------------------------------
  // Golden Opener, Ascetic, Overtime and the Insert Coin guard on a guess
  // ---------------------------------------------------------------------------

  function shownFeedback(entry) {
    var shown = entry && (Array.isArray(entry.shownFeedback) ? entry.shownFeedback : entry.feedback);
    return Array.isArray(shown) ? shown : [];
  }

  // A Duel's history also holds the AI's rows (actor "ai"): what looks at
  // "your last guess" or "your first guess" counts only the player's own.
  function playerRows(history) {
    return (Array.isArray(history) ? history : []).filter(function mine(entry) { return !entry || entry.actor !== "ai"; });
  }

  // Each yellow of the opening guess takes its spot in the answer.
  function goldenOpener(game, entry) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    if (secret.length !== 5 || !entry) return [];
    var word = String(entry.word || "").toUpperCase();
    var shown = shownFeedback(entry);
    var masked = Array.isArray(entry.maskedIndices) ? entry.maskedIndices : [];
    if (!Array.isArray(state.revealedPositions)) state.revealedPositions = [null, null, null, null, null];
    var placed = [];
    shown.forEach(function each(colour, index) {
      if (colour !== "yellow" || masked.indexOf(index) !== -1) return;
      var letter = word[index];
      for (var spot = 0; spot < 5; spot += 1) {
        if (secret[spot] === letter && !state.revealedPositions[spot] && word[spot] !== letter) {
          state.revealedPositions[spot] = letter;
          placed.push({ letter: letter, index: spot });
          break;
        }
      }
    });
    if (!placed.length) return placed;
    state.knownPresent = uniqueSorted((state.knownPresent || []).concat(placed.map(function l(item) { return item.letter; })));
    entry.umtGoldenOpener = placed;
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
    if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
    return placed;
  }

  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithNewBadges() {
    var state = this.state;
    if (state && state.umtCoinOffer) {
      return { ok: false, error: "Out of guesses: decide whether to pay for one more first." };
    }
    var before = state && Array.isArray(state.history) ? state.history.length : 0;
    var result = baseSubmit.apply(this, arguments);
    state = this.state;
    var allRows = state && Array.isArray(state.history) ? state.history : [];
    if (!result || !result.ok || allRows.length <= before) return result;
    var history = playerRows(allRows);
    try {
      var entry = history[history.length - 1];
      var solved = Boolean(entry && state.secret && entry.word === state.secret);
      if (!solved) bookQuestChain(this);
      if (!solved && history.length <= Math.min(3, levelOf(this, "goldenOpener"))
          // Still playing, or on a quest reward screen when this guess
          // finished a quest (that used to skip the guess).
          && (state.status === "playing" || state.status === "questReward") && !state.pendingRoundEnd
          && has(this, "goldenOpener")) {
        var placed = goldenOpener(this, entry);
        if (placed.length) {
          note(this, "Golden Opener: " + placed.map(function say(item) { return item.letter + " goes in position " + (item.index + 1); }).join(", ") + ".");
        }
      }
      var multiplier = solved && !isBoss(this) && has(this, "ascetic") ? asceticMultiplier(this) : 1;
      if (multiplier > 1) {
        var extra = Math.round(num(state.roundScore) * (multiplier - 1));
        if (extra > 0 && stageBonus(this, extra, "umtAscetic", "Ascetic ×" + multiplier) > 0) note(this, "Ascetic ×" + multiplier + ": +" + extra + " points.");
      }
      masterChoices(this);
      save(this);
    } catch (error) {
      console.warn("Cuddle new badges: a power failed after a guess.", error);
    }
    return result;
  };

  var baseMulligan = proto.mulligan;
  if (typeof baseMulligan === "function") {
    proto.mulligan = function mulliganUnlessPaying() {
      if (this.state && this.state.umtCoinOffer) return { ok: false, error: "Out of guesses: decide whether to pay for one more first." };
      return baseMulligan.apply(this, arguments);
    };
  }

  // ---------------------------------------------------------------------------
  // Quest Scout
  // ---------------------------------------------------------------------------

  function questContext(game, word) {
    var state = game.state;
    var feedback = typeof Engine.evaluateFeedback === "function" ? Engine.evaluateFeedback(state.secret, word) : [];
    var required = [];
    (state.history || []).forEach(function each(previous) {
      String(previous.word || "").split("").forEach(function letter(value, index) {
        if ((previous.feedback || [])[index] !== "grey") required.push(value);
      });
    });
    return {
      word: word,
      feedback: feedback,
      history: state.history,
      knownAbsent: state.knownAbsent,
      knownPresent: state.knownPresent,
      revealedPositions: state.revealedPositions,
      requiredLetters: required,
      rareLetters: (state.activeQuest && state.activeQuest.rareLetters) || []
    };
  }

  function scoutKey(state) {
    var quest = state.activeQuest;
    return quest ? stageKey(state) + ":" + num(state.guessesUsed) + ":" + (quest.id || "") + ":" + (quest.title || "") : "";
  }

  function scoutQuest(game) {
    var state = game.state;
    var level = Math.min(2, levelOf(game, "questScout"));
    if (!level || state.status !== "playing" || !state.activeQuest) return;
    var key = scoutKey(state);
    if (state.umtQuestHint && state.umtQuestHint.key === key) return;
    var book = window.CuddleQuestBook;
    if (!book || typeof book.evaluateQuest !== "function" || typeof game.getFeasibleWords !== "function") return;
    var words = game.getFeasibleWords(2000) || [];
    var random = randomOf(game);
    // A random fitting word, not always the alphabetically first.
    var start = words.length ? Math.floor(random() * words.length) : 0;
    var found = null;
    for (var step = 0; step < words.length && !found; step += 1) {
      var word = String(words[(start + step) % words.length] || "").toUpperCase();
      if (word.length !== 5 || word === String(state.secret || "").toUpperCase()) continue;
      try {
        if (book.evaluateQuest(state.activeQuest, questContext(game, word))) found = word;
      } catch (_error) {
        // A quest that can't judge this word: keep looking.
      }
    }
    var revealed = Array.isArray(state.revealedPositions) ? state.revealedPositions : [];
    var spots = [];
    if (found) {
      var open = [0, 1, 2, 3, 4].filter(function free(index) { return !revealed[index]; });
      while (open.length && spots.length < level) {
        var index = open.splice(Math.floor(random() * open.length), 1)[0];
        spots.push({ index: index, letter: found[index] });
      }
      spots.sort(function byIndex(a, b) { return a.index - b.index; });
    }
    // The word itself stays hidden: only the placed letters are kept.
    state.umtQuestHint = { key: key, spots: spots };
  }

  var baseEnsureQuest = proto._ensureQuestForNextGuess;
  if (typeof baseEnsureQuest === "function") {
    proto._ensureQuestForNextGuess = function ensureQuestWithScout() {
      var result = baseEnsureQuest.apply(this, arguments);
      try {
        placeChainedQuest(this);
      } catch (error) {
        console.warn("Cuddle new badges: Quest Chain failed.", error);
      }
      try {
        scoutQuest(this);
      } catch (error) {
        console.warn("Cuddle new badges: Quest Scout failed.", error);
      }
      return result;
    };
  }

  // ---------------------------------------------------------------------------
  // On the page: Quest Scout's letters and Insert Coin's question
  // ---------------------------------------------------------------------------

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch];
    });
  }

  function paintScout(game, root) {
    var state = game && game.state;
    var hint = state && state.umtQuestHint;
    var live = Boolean(hint && state.status === "playing" && state.activeQuest && hint.key === scoutKey(state) && hint.spots && hint.spots.length);
    var rows = root.querySelectorAll(".cuddle-board-row");
    var row = live ? rows[num(state.guessesUsed)] : null;
    root.querySelectorAll("[data-umt-quest-hint]").forEach(function clear(tile) {
      if (!row || !row.contains(tile)) tile.removeAttribute("data-umt-quest-hint");
    });
    if (!row) return;
    var wanted = {};
    hint.spots.forEach(function each(spot) { wanted[spot.index] = spot.letter; });
    row.querySelectorAll(".cuddle-tile").forEach(function mark(tile, column) {
      var letter = wanted[column];
      var empty = !tile.classList.contains("is-draft-tile") && !String(tile.textContent || "").trim();
      var value = letter && empty ? letter : null;
      if (tile.getAttribute("data-umt-quest-hint") === value) return;
      if (value) {
        tile.setAttribute("data-umt-quest-hint", value);
        tile.setAttribute("title", "Quest Scout: " + value + " here fits the quest");
      } else {
        tile.removeAttribute("data-umt-quest-hint");
      }
    });
  }

  function paintCoin(game) {
    var state = game && game.state;
    var offer = state && state.umtCoinOffer;
    var existing = document.querySelector(".umt-coin-offer");
    var screen = document.getElementById("cuddleScreen");
    var visible = Boolean(offer && screen && screen.classList.contains("active") && document.getElementById("cuddleRoot"));
    if (!visible) {
      if (existing) existing.remove();
      return;
    }
    var signature = offer.key + ":" + offer.price + ":" + num(state.cuddleMoney);
    if (existing && existing.dataset.signature === signature) return;
    if (!existing) {
      existing = document.createElement("div");
      existing.className = "umt-coin-offer";
      screen.appendChild(existing);
    }
    existing.dataset.signature = signature;
    var wallet = num(state.cuddleMoney);
    existing.innerHTML = '<section class="umt-coin-card" role="dialog" aria-modal="true" aria-labelledby="umtCoinTitle">'
      + '<span class="umt-coin-kicker">Insert Coin</span>'
      + '<h2 id="umtCoinTitle">Out of guesses!</h2>'
      + "<p>Pay <b>$" + offer.price + "</b> for one more guess?</p>"
      + '<p class="umt-coin-wallet">You have $' + escapeHtml(wallet) + ".</p>"
      + '<div class="umt-coin-actions">'
      + '<button type="button" class="cuddle-btn cuddle-btn-primary" data-umt-coin="pay">Pay $' + offer.price + "</button>"
      + '<button type="button" class="cuddle-btn cuddle-btn-ghost" data-umt-coin="decline">No, end the stage</button>'
      + "</div></section>";
  }

  var paintPending = false;
  function paint() {
    paintPending = false;
    var game = activeGame();
    var root = document.getElementById("cuddleRoot");
    if (!game || !root) return;
    try {
      paintScout(game, root);
      paintCoin(game);
    } catch (error) {
      console.warn("Cuddle new badges: paint failed.", error);
    }
  }

  function schedulePaint() {
    if (paintPending || typeof window.requestAnimationFrame !== "function") return;
    paintPending = true;
    window.requestAnimationFrame(paint);
  }

  document.addEventListener("click", function onCoin(event) {
    var button = event.target instanceof Element ? event.target.closest("[data-umt-coin]") : null;
    if (!button) return;
    var game = activeGame();
    if (!game) return;
    event.preventDefault();
    if (button.dataset.umtCoin === "pay") game.umtAcceptCoin();
    else game.umtDeclineCoin();
  });

  function startPainting() {
    var root = document.getElementById("cuddleScreen");
    if (!root || typeof MutationObserver === "undefined") return;
    // Only the board's own markup changing matters; the attributes set
    // here don't retrigger it.
    new MutationObserver(schedulePaint).observe(root, { childList: true, subtree: true });
    window.addEventListener("cuddle:campaign-update", schedulePaint);
    schedulePaint();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startPainting);
  else startPainting();

  // ---------------------------------------------------------------------------
  // Starting kit: Easy and Medium runs start with Bigger Hand and Fish Hook
  // (Bigger Hand level 2 on Easy), taken the way a reward pick is, so they
  // show on the badge page and count for their schools.
  // ---------------------------------------------------------------------------

  var STARTING_KIT = {
    // Easy shows no badges (cuddle-easy-mode.js), and every letter of the
    // answer is dealt into the opening hand, so no Fish Hook.
    easy: [["handSizeBoost", 2]],
    medium: [["handSizeBoost", 1], ["fishHook", 1]]
  };

  function kitCard(game, id) {
    var catalog = typeof game._upgradeCatalog === "function" ? (game._upgradeCatalog() || []) : [];
    var card = catalog.find(function same(item) { return item && item.id === id; });
    if (card) return card;
    var tree = registry();
    var node = tree && tree.findNode(id);
    return node ? { id: id, key: id, title: node.title, icon: node.icon, description: node.description || "", tier: node.tier, kind: "upgrade" } : null;
  }

  function grantStartingKit(game, difficulty) {
    var state = game && game.state;
    if (!state || inDuel(state) || state.umtStartingKit || typeof game._grantUpgradeChoice !== "function") return;
    var mega = state.megaState || state.mega || {};
    var kit = STARTING_KIT[String(difficulty || mega.difficulty || "")];
    state.umtStartingKit = true;
    if (!kit) return;
    kit.forEach(function give(entry) {
      for (var copy = levelOf(game, entry[0]); copy < entry[1]; copy += 1) {
        var card = kitCard(game, entry[0]);
        if (!card) return;
        var result = game._grantUpgradeChoice(Object.assign({}, card, { key: card.key || card.id }));
        if (!result || result.ok === false) return;
      }
    });
    save(game);
  }

  var baseStartNew = proto.startNew;
  if (typeof baseStartNew === "function") {
    proto.startNew = function startNewWithStartingKit(difficulty) {
      var result = baseStartNew.apply(this, arguments);
      try {
        grantStartingKit(this, difficulty);
      } catch (error) {
        console.warn("Cuddle new badges: starting kit failed.", error);
      }
      return result;
    };
  }

  window.CuddleNewBadges = Object.freeze({
    freeOpeners: freeOpeners,
    marketOffer: marketOffer,
    hasCleanSlate: function hasCleanSlate(game) { return has(game, "cleanSlate"); },
    cleanSlateCount: function count(game) { return has(game, "cleanSlate") ? cleanSlateCount(game) : 0; },
    asceticTiers: asceticTiers,
    badgeCount: badgeCount,
    asceticMultiplier: asceticMultiplier,
    ASCETIC_TIERS: ASCETIC_TIERS,
    overtimeBonus: overtimeBonus,
    grantOvertime: grantOvertime,
    ledgerCredit: ledgerCredit,
    ledgerRate: ledgerRate,
    MASTERED_TEXT: MASTERED_TEXT
  });
}());
