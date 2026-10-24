/* Cuddle: schools.
 *
 * Every badge belongs to a school (cuddle-skill-tree.js SCHOOLS): Speed,
 * Hints, Cards, Squares, Elimination, Money, Quests or Restraint (a few
 * general badges belong to none). The ids are older names: flint, prism,
 * flora, tile, parchment, gold, brass, pearl. Each level of a badge adds
 * its rarity's weight to its school (common 1, rare 2, epic 3, legendary
 * 5); a school's points unlock its three ranks (4 / 9 / 15, Restraint
 * 3 / 6 / 9), and each rank adds a perk. The ranks replaced the old
 * two-badge combos.
 *
 *   Speed        I   solve by guess 3: +10 points
 *                II  solve by guess 3: +1 mulligan next stage
 *                III solve by guess 3: next stage starts with a letter placed
 *   Hints        I   one tile of each stage's first guess shows a compass
 *                       arrow (cuddle-compass.js)
 *                II  after guess 2, a letter turns yellow
 *                III once a stage, test a consonant: drag it to the Test pad
 *                    above the hand (or tap the pad, then the card)
 *   Cards        I   +1 lucky card every stage
 *                II  +1 idea card and +1 mulligan every stage
 *                III +2 dead cards every stage, and every dead card you
 *                    draw turns angel; tap an angel and it flies to heaven
 *                    for +10 points, and a new card is drawn
 *   Squares      I   a yellow on a square pays like a green
 *                II  a yellow or green also sets off the squares beside it
 *                    (cuddle-points-money.js)
 *                III still to come
 *   Elimination  I   each grey tile +1 point
 *                II  each stage starts with a consonant crossed out
 *                III crossed-out consonants in hand are swapped after a guess
 *   Money        I   +$3 a solve
 *                II  the shop is 20% cheaper
 *                III 10% interest after each solve (up to +$15)
 *   Quests       I   each quest +10 points
 *                II  quest reward screens show 1 more choice
 *                III each quest +1 mulligan; 2 quests in a stage: +1 Joker card
 *   Restraint    I   skipping a reward +10 points
 *                II  solve without a mulligan: +15 points
 *                III after a skip, the next reward screen is all Epic cards
 *
 * Perks that live inside another layer's effect (lucky and idea cards,
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

  var FLINT_POINTS = 10;
  var FLINT_BY = 3;
  var PARCHMENT_GREY = 1;
  var GOLD_MONEY = 3;
  var GOLD_DISCOUNT = 0.2;
  var GOLD_INTEREST = 0.1;
  var GOLD_INTEREST_CAP = 15;
  var BRASS_POINTS = 10;
  var PEARL_SKIP = 10;
  var PEARL_CLEAN = 15;
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
    // A calm first world keeps the schools for after its boss.
    if (window.CuddleFirstRun && window.CuddleFirstRun.schoolsHidden(game)) return out;
    var points = registry.schoolPoints(game);
    registry.SCHOOL_ORDER.forEach(function each(id) {
      out[id] = registry.schoolRank(id, points[id]);
    });
    return out;
  }

  // A Duel plays with the run's schools too (its state is a copy of the
  // run's, badges included).
  function rankOf(game, school) {
    if (!game || !game.state) return 0;
    return num(ranks(game)[school]);
  }

  // The numbers other layers read.
  function perk(game, name) {
    switch (name) {
      case "luckyTiles": return rankOf(game, "flora") >= 1 ? 1 : 0;
      case "ideaTiles": return rankOf(game, "flora") >= 2 ? 1 : 0;
      // Cards III: 2 more dead cards a stage, and dead cards turn angel
      // when drawn (cuddle-burdens.js).
      case "angelCards": return rankOf(game, "flora") >= 3 ? 2 : 0;
      // Squares I and II (cuddle-points-money.js).
      case "squaresEven": return rankOf(game, "tile") >= 1 ? 1 : 0;
      case "squaresSpread": return rankOf(game, "tile") >= 2 ? 1 : 0;
      case "shopDiscount": return rankOf(game, "gold") >= 2 ? GOLD_DISCOUNT : 0;
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

  function payMoney(game, amount, label, field) {
    if (!amount) return 0;
    game.state.cuddleMoney = Math.max(0, num(game.state.cuddleMoney) + amount);
    // Paid on the solve: listed in the cash-out.
    if (field && window.CuddlePayoutLines) window.CuddlePayoutLines.addMoney(game, field, label, amount);
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

  function record(state) {
    if (!state.umtSchools || typeof state.umtSchools !== "object") state.umtSchools = { seen: {} };
    return state.umtSchools;
  }

  // A Joker card into the hand (one more use if one is there already).
  function giveJoker(game) {
    var state = game.state;
    var glyph = Engine.CUDDLE_JOKER_GLYPH;
    if (!glyph) return;
    var held = (state.hand || []).some(function joker(card) { return card.source === "joker" && card.glyph === glyph; });
    if (held) {
      var mega = state.megaState || (state.megaState = {});
      mega.jokerCharges = Math.max(0, num(mega.jokerCharges)) + 1;
    } else {
      state.hand.push({ id: game._nextId("joker"), glyph: glyph, source: "joker" });
      if (typeof game._trimHandToLimit === "function") game._trimHandToLimit();
    }
  }

  function addMulligans(game, count) {
    var gained = typeof game.mulliganGain === "function" ? game.mulliganGain(count) : count;
    game.state.mulligansLeft = Math.max(0, num(game.state.mulligansLeft)) + gained;
    return gained;
  }

  // Hints III: once a stage, a consonant in your hand is tested -- you
  // learn whether it's in the answer (yellow) or not (crossed out).
  function testableLetters(game) {
    var state = game && game.state;
    if (!state || state.status !== "playing" || rankOf(game, "prism") < 3) return [];
    if (record(state).tested === stageKey(state)) return [];
    var known = new Set([].concat(state.knownPresent || [], state.knownAbsent || [], (state.revealedPositions || []).filter(Boolean)));
    var letters = [];
    (state.hand || []).forEach(function each(card) {
      var letter = String(card && card.glyph || "").toUpperCase();
      if (!/^[A-Z]$/.test(letter) || VOWELS.indexOf(letter) !== -1 || known.has(letter) || letters.indexOf(letter) !== -1) return;
      if (typeof game.isInfiniteCard === "function" && game.isInfiniteCard(card)) return;
      letters.push(letter);
    });
    return letters.sort();
  }

  proto.schoolTestLetter = function schoolTestLetter(rawLetter) {
    var letter = String(rawLetter || "").toUpperCase();
    if (testableLetters(this).indexOf(letter) === -1) return { ok: false, error: "That card can't be tested now." };
    var state = this.state;
    record(state).tested = stageKey(state);
    var inWord = String(state.secret || "").toUpperCase().indexOf(letter) !== -1;
    if (window.CuddleHintFx && typeof window.CuddleHintFx.note === "function") window.CuddleHintFx.note(this, letter, "Hints rank");
    if (inWord) {
      state.knownPresent = Array.from(new Set((state.knownPresent || []).concat([letter]))).sort();
      if (typeof this._syncInfiniteCards === "function") this._syncInfiniteCards();
      if (typeof this.drawToHandLimit === "function") this.drawToHandLimit();
    } else {
      state.knownAbsent = Array.from(new Set((state.knownAbsent || []).concat([letter]))).sort();
    }
    state.lastMessage = "Hints rank: " + letter + (inWord ? " is in the answer." : " is not in the answer.");
    save(this);
    return { ok: true, inWord: inWord };
  };

  // Elimination III: crossed-out consonants in the hand go, new cards come.
  function swapDeadLetters(game) {
    var state = game.state;
    var absent = new Set(state.knownAbsent || []);
    var ids = (state.hand || []).filter(function dead(card) {
      return card && absent.has(String(card.glyph || "").toUpperCase()) && card.source !== "joker"
        && !(typeof game.isInfiniteCard === "function" && game.isInfiniteCard(card));
    }).map(function id(card) { return card.id; });
    if (!ids.length || typeof game._discardCards !== "function") return 0;
    var removed = game._discardCards(ids);
    if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
    return removed.length;
  }

  // Restraint III: the next reward screen after a skip is all Epic cards.
  function tierOf(card) {
    return String(card && (card.__cuddleV8Tier || card.tier || card.rarity) || "").toLowerCase();
  }

  // The economy's own draw (cuddle-economy-rarity-v8.js packRewards) picks
  // Epic cards by its rarities (falling back a rarity when Epics run out);
  // each is turned back into the catalog's card so picking it works like
  // any reward.
  function withEpic(game, choices) {
    if (!Array.isArray(choices) || !choices.length) return choices;
    if (choices.every(function epic(card) { return tierOf(card) === "epic"; })) return choices;
    var economy = window.CuddleEconomyRarityV8;
    if (!economy || typeof economy.packRewards !== "function") return choices;
    var picks = economy.packRewards(game, choices.map(function epic() { return "epic"; }), stageKey(game.state) + ":restraint-epic", 0) || [];
    if (!picks.length) return choices;
    var catalog = typeof game._upgradeCatalog === "function" ? game._upgradeCatalog() || [] : [];
    return picks.map(function card(pick) {
      var def = catalog.find(function same(item) { return item && (item.id === pick.id || item.key === pick.key); });
      return Object.assign({}, def || pick, { key: (def && def.key) || pick.key || pick.id, __cuddleV8Tier: pick.tier, __cuddleV8OfferTier: pick.tier });
    });
  }

  // -- rank-ups --------------------------------------------------------------
  // Announced once each (the badge page shows the rest).
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
    // Ranks a starting pack hands out aren't announced: a new run's first
    // screen has enough on it. (The badge page shows them.)
    var started = num(state.round) > 1 || (Array.isArray(state.history) && state.history.length > 0);
    if (announce && reached.length && started) {
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

  // Stage start: Prism I, Parchment II, Flora II's mulligan.
  wrap("_beginRound", function build(original) {
    return function beginRoundWithSchools() {
      var result = original.apply(this, arguments);
      var state = this.state;
      if (!state || state.status !== "playing") return result;
      try {
        // A badge picked through a path that skips chooseUpgrade (packs,
        // the shop, playstyle powers) still ranks its school up here.
        checkRanks(this, true);
        var key = stageKey(state);
        if (!state.umtSchools) state.umtSchools = { seen: {} };
        if (state.umtSchools.stage === key) return result;
        state.umtSchools.stage = key;
        var now = ranks(this);
        var mine = record(state);
        // Restraint III: an Epic screen that was shown has been answered.
        if (mine.epicShown) {
          mine.epicShown = false;
          mine.epicNext = false;
        }
        // Hints I is an arrow on the first guess (cuddle-compass.js).
        if (num(now.parchment) >= 2) ruleOut(this, false, "Elimination rank");
        if (num(now.flora) >= 2) addMulligans(this, 1);
        // What a fast solve last stage earned (Speed II and III).
        var speed = mine.speedNext;
        mine.speedNext = null;
        if (speed && speed.mulligan) note(this, "Speed rank: +" + addMulligans(this, 1) + " mulligan.");
        if (speed && speed.letter) hint(this, "green", "Speed rank");
        save(this);
      } catch (error) {
        console.warn("Cuddle schools: a stage-start perk failed.", error);
      }
      return result;
    };
  });

  wrap("submitDraft", function build(original) {
    return function submitDraftWithSchools() {
      keepEpicOnTop();
      var state = this.state;
      var before = state && Array.isArray(state.history) ? state.history.length : 0;
      var result = original.apply(this, arguments);
      state = this.state;
      var allRows = state && Array.isArray(state.history) ? state.history : [];
      if (!result || !result.ok || allRows.length <= before) return result;
      // A Duel's history holds the AI's rows too: only the player's count.
      var history = allRows.filter(function mine(row) { return !row || row.actor !== "ai"; });
      try {
        var entry = history[history.length - 1];
        var now = ranks(this);
        var mine = record(state);
        var key = stageKey(state);
        var solved = Boolean(entry && state.secret && entry.word === state.secret);
        var shown = Array.isArray(entry.shownFeedback) ? entry.shownFeedback : (entry.feedback || []);
        var greys = shown.filter(function grey(value) { return value === "grey"; }).length;
        var parchment = num(now.parchment);
        if (parchment >= 1 && greys) stageBonus(this, greys * PARCHMENT_GREY, "umtSchoolParchment", "Elimination rank");
        var brass = num(now.brass);
        if (entry.questComplete && brass >= 1) {
          stageBonus(this, BRASS_POINTS, "umtSchoolBrass", "Quests rank");
          if (brass >= 3) {
            note(this, "Quests rank: +" + addMulligans(this, 1) + " mulligan.");
            if (!mine.quests || mine.quests.key !== key) mine.quests = { key: key, count: 0, joker: false };
            mine.quests.count += 1;
            if (mine.quests.count >= 2 && !mine.quests.joker) {
              mine.quests.joker = true;
              giveJoker(this);
              note(this, "Quests rank: 2 quests this stage, +1 Joker card.");
            }
          }
        }
        if (solved) {
          var flint = num(now.flint);
          if (flint >= 1 && history.length <= FLINT_BY) {
            if (stageBonus(this, FLINT_POINTS, "umtSchoolFlint", "Speed rank") > 0) note(this, "Speed rank: solved by guess " + FLINT_BY + ", +" + FLINT_POINTS + " points.");
            if (flint >= 2) mine.speedNext = { mulligan: true, letter: flint >= 3 };
          }
          var gold = num(now.gold);
          if (gold >= 1) payMoney(this, GOLD_MONEY, "Money rank", "umtSchoolGold");
          if (gold >= 3) {
            var interest = Math.min(GOLD_INTEREST_CAP, Math.floor(num(state.cuddleMoney) * GOLD_INTEREST));
            if (interest > 0) payMoney(this, interest, "Money rank interest", "umtSchoolGoldInterest");
          }
          if (num(now.pearl) >= 2 && mine.mulliganed !== key) {
            if (stageBonus(this, PEARL_CLEAN, "umtSchoolPearl", "Restraint rank") > 0) note(this, "Restraint rank: solved without a mulligan, +" + PEARL_CLEAN + " points.");
          }
        } else if (state.status === "playing" || state.status === "questReward") {
          // Hints II after guess 2 (a quest reward screen may be up; the
          // stage goes on behind it).
          if (num(now.prism) >= 2 && history.length === 2) hint(this, "yellow", "Hints rank");
          // Elimination III: crossed-out consonants leave the hand.
          if (parchment >= 3) {
            var swapped = swapDeadLetters(this);
            if (swapped) note(this, "Elimination rank: " + swapped + " crossed-out card" + (swapped === 1 ? "" : "s") + " swapped.");
          }
        }
        // Quests II: quest reward screens show 1 more choice.
        if (state.status === "questReward" && brass >= 2) moreQuestChoices(this);
        save(this);
      } catch (error) {
        console.warn("Cuddle schools: a perk failed after a guess.", error);
      }
      return result;
    };
  });

  // Quests II: one more quest reward choice (once per reward screen).
  function moreQuestChoices(game) {
    var state = game.state;
    var choices = Array.isArray(state.questRewardChoices) ? state.questRewardChoices : [];
    var screen = stageKey(state) + ":" + (Array.isArray(state.history) ? state.history.length : 0);
    if (!choices.length || record(state).questScreen === screen) return;
    record(state).questScreen = screen;
    var book = window.CuddleQuestBook;
    var seen = new Set(choices.map(function id(item) { return item && item.id; }));
    var pool = book && typeof book.rewardChoices === "function" ? book.rewardChoices(8, game.random) || [] : [];
    var extra = pool.find(function fresh(item) { return item && item.id && !seen.has(item.id); });
    if (extra) state.questRewardChoices = choices.concat([extra]);
  }
  ["chooseQuestReward"].forEach(function watch(name) {
    wrap(name, function build(original) {
      return function chooseQuestRewardWithSchools() {
        var result = original.apply(this, arguments);
        try {
          if (this.state && this.state.status === "questReward" && rankOf(this, "brass") >= 2) moreQuestChoices(this);
        } catch (_error) { /* the screen keeps its choices */ }
        return result;
      };
    });
  });

  // Restraint I: a skip pays +10 more. III: the next reward screen has an
  // Epic card.
  wrap("skipUpgrade", function build(original) {
    return function skipUpgradeWithPearl() {
      var result = original.apply(this, arguments);
      var pearl = rankOf(this, "pearl");
      if (result && result.ok && pearl >= 1) {
        this.state.score = num(this.state.score) + PEARL_SKIP;
        result.points = num(result.points) + PEARL_SKIP;
        note(this, "Restraint rank: +" + PEARL_SKIP + " points.");
        if (pearl >= 3) {
          record(this.state).epicNext = true;
          record(this.state).epicShown = false;
          note(this, "Restraint rank: your next reward screen is all Epic cards.");
        }
        save(this);
      }
      return result;
    };
  });

  // The Epic card goes in as the reward screen is drawn. Other layers
  // re-wrap _generateUpgradeChoices lazily, so this keeps itself outermost.
  function keepEpicOnTop() {
    var current = proto._generateUpgradeChoices;
    if (typeof current !== "function" || current.__umtSchoolsEpic) return;
    var wrapped = function generateWithEpic() {
      var choices = current.apply(this, arguments);
      try {
        var state = this.state;
        // The screen can be drawn more than once (the cash-out redraws it),
        // so the promise holds until the next stage starts.
        if (state && record(state).epicNext && state.upgradePhase !== "difficultyStart" && Array.isArray(choices) && choices.length) {
          choices = withEpic(this, choices);
          record(state).epicShown = true;
        }
      } catch (_error) { /* the screen keeps its cards */ }
      return choices;
    };
    wrapped.__umtSchoolsEpic = true;
    proto._generateUpgradeChoices = wrapped;
  }
  keepEpicOnTop();

  // Restraint II: a stage where a mulligan was used doesn't pay its bonus.
  wrap("mulligan", function build(original) {
    return function mulliganWithSchools() {
      var result = original.apply(this, arguments);
      var state = this.state;
      if (!result || !result.ok || !state) return result;
      var mine = record(state);
      var key = stageKey(state);
      mine.mulliganed = key;
      keepEpicOnTop();
      save(this);
      return result;
    };
  });

  function activeGame() {
    try { return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function" ? window.CuddleBranchMap.getActiveGame() : null; } catch (_error) { return null; }
  }

  // In a Duel, the Duel's own hand and answer (cuddle-expanded-stages.js).
  function inPlay(game, fn, changed) {
    var stages = window.CuddleExpandedStages;
    return stages && typeof stages.withDuel === "function" ? stages.withDuel(game, fn, changed) : fn(game);
  }

  function testLetter(letter) {
    var game = activeGame();
    if (!game) return null;
    testArmed = false;
    var result = inPlay(game, function test(g) { return g.schoolTestLetter(letter); }, true);
    window.dispatchEvent(new Event("cuddle:campaign-update"));
    return result;
  }

  // Hints III: a consonant in the Clues strip (cuddle-clues.js) tapped to
  // be tested.
  document.addEventListener("click", function testTap(event) {
    var button = event.target && event.target.closest ? event.target.closest("[data-school-test]") : null;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    testLetter(button.getAttribute("data-school-test"));
  }, true);

  // Hints III, from the hand: a "Test here" pad sits above the hand while
  // the stage's test is unused. Drag a consonant onto it
  // (cuddle-drag-mode.js calls dropOnTestPad), or tap the pad and then the
  // consonant.
  var testArmed = false;
  function padLetters() {
    var game = activeGame();
    if (!game) return [];
    var stages = window.CuddleExpandedStages;
    if (stages && typeof stages.duelPlayerTurn === "function" && stages.duelPlayerTurn(game) === false) return [];
    return inPlay(game, function letters(g) { return testableLetters(g); }) || [];
  }

  function syncTestPad() {
    var hand = document.querySelector("#cuddleRoot .cuddle-hand-panel .cuddle-hand");
    var pad = document.querySelector("#cuddleRoot .umt-test-pad");
    var letters = hand ? padLetters() : [];
    if (!letters.length) {
      testArmed = false;
      if (pad) pad.remove();
      return;
    }
    if (!pad || pad.parentNode !== hand) {
      if (pad) pad.remove();
      pad = document.createElement("button");
      pad.type = "button";
      pad.className = "umt-test-pad";
      pad.setAttribute("data-umt-test-drop", "");
      // Kept through redraws (cuddle-morph.js); this pass updates it.
      pad.setAttribute("data-umt-keep", "");
      hand.insertBefore(pad, hand.firstChild);
    }
    var text = testArmed ? "Tap a consonant to test it" : "Test here \u00b7 drag a consonant in";
    if (pad.textContent !== text) pad.textContent = text;
    if (pad.classList.contains("is-armed") !== testArmed) pad.classList.toggle("is-armed", testArmed);
    pad.setAttribute("aria-label", testArmed ? "Testing: tap a consonant card. Tap here again to cancel." : "Test a consonant, once this stage: is it in the answer? Drag one here, or tap here and then the card.");
    pad.title = "Hints rank: once this stage, learn whether a consonant is in the answer";
    document.querySelectorAll("#cuddleRoot .cuddle-hand .cuddle-card[data-card-glyph]").forEach(function mark(card) {
      var can = testArmed && letters.indexOf(String(card.getAttribute("data-card-glyph")).toUpperCase()) !== -1;
      if (card.classList.contains("umt-testable") !== can) card.classList.toggle("umt-testable", can);
    });
  }

  document.addEventListener("click", function padTap(event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    if (target.closest(".umt-test-pad")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      testArmed = !testArmed;
      syncTestPad();
      return;
    }
    if (!testArmed) return;
    var card = target.closest("#cuddleRoot .cuddle-hand .cuddle-card[data-card-glyph]");
    if (!card) { testArmed = false; syncTestPad(); return; }
    var letter = String(card.getAttribute("data-card-glyph")).toUpperCase();
    event.preventDefault();
    event.stopImmediatePropagation();
    if (padLetters().indexOf(letter) === -1) {
      flashPad(VOWELS.indexOf(letter) !== -1 ? "Vowels can't be tested" : "That letter is already known");
      return;
    }
    testLetter(letter);
  }, true);

  function flashPad(message) {
    var pad = document.querySelector("#cuddleRoot .umt-test-pad");
    if (!pad) return;
    pad.textContent = message;
    pad.classList.add("is-refused");
    setTimeout(function back() { pad.classList.remove("is-refused"); syncTestPad(); }, 1200);
  }

  function dropOnTestPad(letter) {
    var upper = String(letter || "").toUpperCase();
    if (padLetters().indexOf(upper) === -1) {
      flashPad(VOWELS.indexOf(upper) !== -1 ? "Vowels can't be tested" : "That letter is already known");
      return false;
    }
    var result = testLetter(upper);
    return Boolean(result && result.ok);
  }

  var padFrame = 0;
  function schedulePad() {
    if (padFrame) return;
    padFrame = requestAnimationFrame(function run() {
      padFrame = 0;
      try { syncTestPad(); } catch (error) { console.warn("Cuddle schools test pad:", error); }
    });
  }
  function watchPad() {
    var host = document.getElementById("cuddleScreen");
    if (!host) { document.addEventListener("DOMContentLoaded", watchPad, { once: true }); return; }
    new MutationObserver(function changed(mutations) {
      // Its own updates are no reason to look again.
      var relevant = mutations.some(function outside(m) {
        var node = m.target && m.target.nodeType === 1 ? m.target : m.target && m.target.parentElement;
        return !(node && node.closest && node.closest(".umt-test-pad"));
      });
      if (relevant) schedulePad();
    }).observe(host, { childList: true, subtree: true });
    schedulePad();
  }
  watchPad();

  window.CuddleSchools = Object.freeze({
    testableLetters: testableLetters,
    dropOnTestPad: dropOnTestPad,
    ranks: ranks,
    rankOf: rankOf,
    perk: perk,
    checkRanks: checkRanks,
    badgeCount: badgeCount
  });
}());
