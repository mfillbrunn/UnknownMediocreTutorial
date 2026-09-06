/* CUDDLE_COACH_EXPANSION v1
 * Optional answer counter, stackable exact-position hints, boss kits,
 * Cuddle Meter, unused-row money, and three new permanent boss rewards.
 * Loaded after cuddle-money-mode.js.
 */
(function installCuddleCoachExpansion() {
  "use strict";

  var Engine = window.CuddleEngine;
  if (!Engine || !Engine.CuddleGame) {
    console.error("Cuddle Coach Expansion: CuddleEngine was not available.");
    return;
  }

  var Game = Engine.CuddleGame;
  var proto = Game.prototype;
  if (proto.__cuddleCoachExpansionInstalled) return;
  Object.defineProperty(proto, "__cuddleCoachExpansionInstalled", {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  var VERSION = 1;
  var STATE_KEY = "cuddleCoachExpansion";
  var BASE_METER_THRESHOLD = 12;
  var MIN_METER_THRESHOLD = 3;
  var METER_POP_MS = 1800;
  var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  var VOWELS = new Set("AEIOU".split(""));
  var activeGame = null;
  var observer = null;
  var uiQueued = false;
  var lastThreadSignature = "";

  var UPGRADE_DEFINITIONS = Object.freeze([
    {
      id: "coachPossibleAnswers",
      key: "coachPossibleAnswers",
      icon: "🎧",
      title: "Remaining Setter Box",
      description: "Unlock an exact Possible Answers counter beside the Cuddle board.",
      max: 1
    },
    {
      id: "coachHint",
      key: "coachHint",
      icon: "💡",
      title: "Guesser Hint",
      description: "Gain one exact letter-and-position hint in every eligible round. Stacks up to four hints per round.",
      max: 4
    },
    {
      id: "coachEarlierHint",
      key: "coachEarlierHint",
      icon: "⏪",
      title: "Earlier Hints",
      description: "Unlock your first Guesser Hint for the next round if needed, then move its permanent start earlier. Stacks until round 1.",
      max: 3
    },
    {
      id: "coachMeterThreshold",
      key: "coachMeterThreshold",
      icon: "🩶",
      title: "Softer Cuddle Meter",
      description: "The Cuddle Meter needs three fewer visible grey tiles to fill. Minimum: three.",
      max: 3
    },
    {
      id: "coachMeterReward",
      key: "coachMeterReward",
      icon: "🫶",
      title: "Bigger Cuddle",
      description: "Improve a full meter's reward in order: mulligan → joker → free letter → extra row.",
      max: 3
    }
  ]);

  var SHOP_ITEMS = Object.freeze([
    {
      id: "coachBossExtraRow",
      icon: "➕",
      title: "Boss Breathing Room",
      description: "NEXT BOSS: start with one extra row.",
      cost: 26,
      kind: "consumable",
      inventoryKey: "extraRow"
    },
    {
      id: "coachBossOpeningGreen",
      icon: "🟩",
      title: "Opening Green",
      description: "NEXT BOSS: reveal one correct letter and its exact position at the start.",
      cost: 35,
      kind: "consumable",
      inventoryKey: "openingGreen"
    },
    {
      id: "coachBossTenLetterCull",
      icon: "✂️",
      title: "Ten-Letter Cull",
      description: "NEXT BOSS: remove ten letters that are not in the answer from the usable pool.",
      cost: 24,
      kind: "consumable",
      inventoryKey: "tenLetterCull"
    },
    {
      id: "coachBossUnlimitedMulligans",
      icon: "♾️",
      title: "Regular Wordle Hands",
      description: "NEXT BOSS: use unlimited mulligans, including against no-mulligan effects.",
      cost: 28,
      kind: "consumable",
      inventoryKey: "unlimitedMulligans"
    },
    {
      id: "coachBossRevealThemes",
      icon: "🏷️",
      title: "Theme Bundle",
      description: "NEXT BOSS: reveal up to three answer themes at the start.",
      cost: 16,
      kind: "consumable",
      inventoryKey: "revealThemes"
    },
    {
      id: "coachBossAutoQuests",
      icon: "✅",
      title: "Quest Autopilot",
      description: "NEXT BOSS: every guess receives a quest and automatically completes it.",
      cost: 24,
      kind: "consumable",
      inventoryKey: "autoQuests"
    },
    {
      id: "coachBossDoubleQuestRewards",
      icon: "🎁",
      title: "Double Quest Rewards",
      description: "NEXT BOSS: completed quests grant two reward picks instead of one.",
      cost: 24,
      kind: "consumable",
      inventoryKey: "doubleQuestRewards"
    },
    {
      id: "coachBossReroll",
      icon: "🎲",
      title: "Boss Reroll",
      description: "BOSS CHOICE: discard both offered bosses and draw two different choices.",
      cost: 18,
      kind: "consumable",
      inventoryKey: "bossReroll"
    },
    {
      id: "coachShopPossibleAnswers",
      icon: "🎧",
      title: "Permanent Remaining Box",
      description: "PERMANENT: unlock the Possible Answers counter for this run.",
      cost: 44,
      kind: "permanent",
      upgradeId: "coachPossibleAnswers"
    },
    {
      id: "coachShopHint",
      icon: "💡",
      title: "Permanent Guesser Hint",
      description: "PERMANENT: add one exact-position hint to every eligible round.",
      cost: 50,
      kind: "permanent",
      upgradeId: "coachHint"
    },
    {
      id: "coachShopEarlierHint",
      icon: "⏪",
      title: "Permanent Earlier Hint",
      description: "PERMANENT: make all Guesser Hints begin one round earlier.",
      cost: 36,
      kind: "permanent",
      upgradeId: "coachEarlierHint"
    },
    {
      id: "coachShopMeterThreshold",
      icon: "🩶",
      title: "Permanent Softer Meter",
      description: "PERMANENT: lower the Cuddle Meter requirement by three.",
      cost: 40,
      kind: "permanent",
      upgradeId: "coachMeterThreshold"
    },
    {
      id: "coachShopMeterReward",
      icon: "🫶",
      title: "Permanent Bigger Cuddle",
      description: "PERMANENT: improve the full-meter reward by one tier.",
      cost: 52,
      kind: "permanent",
      upgradeId: "coachMeterReward"
    }
  ]);

  var BOSS_REWARDS = Object.freeze([
    {
      id: "goldenCompass",
      icon: "🧭",
      title: "Golden Compass",
      description: "Once per round, reveal the most useful untested letter among the remaining possible answers."
    },
    {
      id: "secondCup",
      icon: "☕",
      title: "Second Cup",
      description: "Once per run, automatically add one rescue row when the final row would fail."
    },
    {
      id: "goldenThread",
      icon: "🧵",
      title: "Golden Thread",
      description: "A full five-letter draft pulses and vibrates when it contains an answer letter you have not learned yet."
    }
  ]);

  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function integer(value, fallback) {
    return Math.trunc(finite(value, fallback));
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMoney(value) {
    var amount = Math.round(finite(value, 0));
    return (amount < 0 ? "-$" : "$") + Math.abs(amount).toLocaleString();
  }

  function randomFor(game) {
    try {
      if (game && typeof game.random === "function") return game.random();
    } catch (error) {
      console.warn("Cuddle Coach Expansion: seeded random failed.", error);
    }
    return Math.random();
  }

  function shuffle(values, game) {
    var copy = values.slice();
    for (var index = copy.length - 1; index > 0; index -= 1) {
      var target = Math.floor(randomFor(game) * (index + 1));
      var temporary = copy[index];
      copy[index] = copy[target];
      copy[target] = temporary;
    }
    return copy;
  }

  function defaultInventory() {
    return {
      extraRow: 0,
      openingGreen: 0,
      tenLetterCull: 0,
      unlimitedMulligans: 0,
      revealThemes: 0,
      autoQuests: 0,
      doubleQuestRewards: 0,
      bossReroll: 0
    };
  }

  function defaultActiveBossKit() {
    return {
      key: null,
      extraRow: false,
      openingGreen: false,
      tenLetterCull: false,
      unlimitedMulligans: false,
      revealThemes: false,
      autoQuests: false,
      doubleQuestRewards: false,
      culledLetters: []
    };
  }

  function defaultState() {
    return {
      version: VERSION,
      possibleAnswersUnlocked: false,
      hintsPerRound: 0,
      hintStartRound: 4,
      hintCharges: 0,
      hintsUsed: 0,
      hintLettersRevealed: 0,
      hintRoundsWithUse: 0,
      lastHintRoundKey: null,
      roundKey: null,
      cuddleProgress: 0,
      cuddleThresholdStacks: 0,
      cuddleRewardTier: 0,
      cuddleGreysCollected: 0,
      cuddleTriggers: 0,
      lastMeterReward: null,
      cuddleRewards: { mulligan: 0, joker: 0, letter: 0, row: 0 },
      bankedMulligans: 0,
      bankedFreeLetters: 0,
      bankedExtraRows: 0,
      inventory: defaultInventory(),
      activeBossKit: defaultActiveBossKit(),
      shopPurchases: {},
      newBossRewardsOwned: [],
      goldenCompassUsedRoundKey: null,
      goldenCompassUses: 0,
      secondCupUsed: false,
      goldenThreadSignals: 0,
      unusedRowsPaid: 0,
      unusedRowMoney: 0,
      lastUnusedRows: 0,
      lastUnusedRowMoney: 0,
      bossRerollsUsed: 0,
      lastCompassMessage: "",
      roundThreeHintForced: false
    };
  }

  function ensureCoach(game) {
    if (!game || !game.state) return null;
    var state = game.state;
    var coach = state[STATE_KEY];
    if (!coach || typeof coach !== "object" || Array.isArray(coach)) {
      coach = defaultState();
      state[STATE_KEY] = coach;
    }
    var defaults = defaultState();
    Object.keys(defaults).forEach(function fill(key) {
      if (!(key in coach)) coach[key] = defaults[key];
    });
    coach.version = VERSION;
    coach.possibleAnswersUnlocked = Boolean(coach.possibleAnswersUnlocked);
    coach.hintsPerRound = clamp(integer(coach.hintsPerRound, 0), 0, 4);
    coach.hintStartRound = clamp(integer(coach.hintStartRound, 4), 1, 4);
    coach.hintCharges = Math.max(0, integer(coach.hintCharges, 0));
    coach.hintsUsed = Math.max(0, integer(coach.hintsUsed, 0));
    coach.hintLettersRevealed = Math.max(0, integer(coach.hintLettersRevealed, 0));
    coach.hintRoundsWithUse = Math.max(0, integer(coach.hintRoundsWithUse, 0));
    coach.cuddleProgress = Math.max(0, integer(coach.cuddleProgress, 0));
    coach.cuddleThresholdStacks = clamp(integer(coach.cuddleThresholdStacks, 0), 0, 3);
    coach.cuddleRewardTier = clamp(integer(coach.cuddleRewardTier, 0), 0, 3);
    coach.cuddleGreysCollected = Math.max(0, integer(coach.cuddleGreysCollected, 0));
    coach.cuddleTriggers = Math.max(0, integer(coach.cuddleTriggers, 0));
    if (!coach.lastMeterReward || typeof coach.lastMeterReward !== "object" || !coach.lastMeterReward.label) {
      coach.lastMeterReward = null;
    } else {
      coach.lastMeterReward = {
        seq: Math.max(0, integer(coach.lastMeterReward.seq, 0)),
        label: String(coach.lastMeterReward.label)
      };
    }
    coach.bankedMulligans = Math.max(0, integer(coach.bankedMulligans, 0));
    coach.bankedFreeLetters = Math.max(0, integer(coach.bankedFreeLetters, 0));
    coach.bankedExtraRows = Math.max(0, integer(coach.bankedExtraRows, 0));
    coach.cuddleRewards = Object.assign({ mulligan: 0, joker: 0, letter: 0, row: 0 }, coach.cuddleRewards || {});
    Object.keys(coach.cuddleRewards).forEach(function normalizeReward(key) {
      coach.cuddleRewards[key] = Math.max(0, integer(coach.cuddleRewards[key], 0));
    });
    coach.inventory = Object.assign(defaultInventory(), coach.inventory || {});
    Object.keys(coach.inventory).forEach(function normalizeInventory(key) {
      coach.inventory[key] = Math.max(0, integer(coach.inventory[key], 0));
    });
    coach.activeBossKit = Object.assign(defaultActiveBossKit(), coach.activeBossKit || {});
    coach.activeBossKit.culledLetters = unique(coach.activeBossKit.culledLetters || []).filter(function valid(letter) {
      return /^[A-Z]$/.test(letter);
    });
    coach.shopPurchases = coach.shopPurchases && typeof coach.shopPurchases === "object" ? coach.shopPurchases : {};
    coach.newBossRewardsOwned = unique(coach.newBossRewardsOwned || []).filter(function known(id) {
      return BOSS_REWARDS.some(function match(reward) { return reward.id === id; });
    });
    coach.unusedRowsPaid = Math.max(0, integer(coach.unusedRowsPaid, 0));
    coach.unusedRowMoney = Math.max(0, integer(coach.unusedRowMoney, 0));
    coach.lastUnusedRows = Math.max(0, integer(coach.lastUnusedRows, 0));
    coach.lastUnusedRowMoney = Math.max(0, integer(coach.lastUnusedRowMoney, 0));
    coach.goldenCompassUses = Math.max(0, integer(coach.goldenCompassUses, 0));
    coach.goldenThreadSignals = Math.max(0, integer(coach.goldenThreadSignals, 0));
    coach.bossRerollsUsed = Math.max(0, integer(coach.bossRerollsUsed, 0));
    return coach;
  }

  function resetCoachForNewRun(game) {
    game.state[STATE_KEY] = defaultState();
    return ensureCoach(game);
  }

  function activateGame(game) {
    if (!game || !game.state) return;
    activeGame = game;
    ensureCoach(game);
    queueUi();
  }

  function save(game) {
    try {
      if (game && typeof game.save === "function") game.save();
    } catch (error) {
      console.warn("Cuddle Coach Expansion: save failed.", error);
    }
  }

  function requestRender(game) {
    queueUi();
    try {
      window.dispatchEvent(new CustomEvent("cuddle:campaign-update", {
        detail: { runId: game && game.state ? game.state.runId : null }
      }));
    } catch (error) {
      console.warn("Cuddle Coach Expansion: UI update failed.", error);
    }
  }

  function roundKey(game) {
    var state = game && game.state || {};
    var boss = state.boss && state.boss.id || "normal";
    return [state.runId || "run", state.round || 1, state.secret || "", boss].join(":");
  }

  function meterThreshold(coach) {
    return Math.max(MIN_METER_THRESHOLD, BASE_METER_THRESHOLD - 3 * integer(coach.cuddleThresholdStacks, 0));
  }

  function meterRewardName(coach) {
    return ["Free mulligan", "Joker", "Free letter", "Extra row"][clamp(integer(coach.cuddleRewardTier, 0), 0, 3)];
  }

  // The heart chip counts DOWN to zero. When it lands on zero it briefly names what the
  // fill granted, then settles back to the next requirement on its own re-render.
  var meterPopSeq = 0;
  var meterPopUntil = 0;
  var meterPopTimer = null;

  function renderHeartBadge(game) {
    var coach = ensureCoach(game);
    if (!coach) return "";
    var threshold = meterThreshold(coach);
    var remaining = Math.max(0, threshold - Math.max(0, integer(coach.cuddleProgress, 0)));
    var reward = coach.lastMeterReward;
    var seq = reward ? integer(reward.seq, 0) : 0;
    var now = Date.now();

    if (reward && seq > meterPopSeq) {
      meterPopSeq = seq;
      meterPopUntil = now + METER_POP_MS;
      if (meterPopTimer) clearTimeout(meterPopTimer);
      meterPopTimer = setTimeout(function settle() {
        meterPopTimer = null;
        if (activeGame) requestRender(activeGame);
      }, METER_POP_MS + 40);
    }

    var popping = Boolean(reward && seq === meterPopSeq && now < meterPopUntil);
    var shown = popping ? 0 : remaining;
    var title = popping
      ? "Cuddle Meter full: " + reward.label
      : remaining + " more grey tile" + (remaining === 1 ? "" : "s") + " for " + meterRewardName(coach).toLowerCase();

    return "<div class=\"cuddle-heart-badge" + (popping ? " is-full" : "") + "\" title=\"" + escapeHtml(title) + "\">"
      + "<span class=\"cuddle-heart-chip\" role=\"img\" aria-label=\"" + escapeHtml(title) + "\">"
      + "<svg viewBox=\"0 0 24 22\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 20.6 3.6 12.2A5.2 5.2 0 0 1 12 5.5a5.2 5.2 0 0 1 8.4 6.7z\"/></svg>"
      + "<b>" + shown + "</b></span>"
      + (popping ? "<span class=\"cuddle-heart-pop\">" + escapeHtml(reward.label) + "</span>" : "")
      + "</div>";
  }

  function hasBossReward(game, rewardId) {
    var coach = ensureCoach(game);
    return Boolean(coach && coach.newBossRewardsOwned.includes(rewardId));
  }

  function hiddenPositions(game) {
    if (typeof game._hiddenPositions === "function") return game._hiddenPositions();
    return (game.state.revealedPositions || Array(5).fill(null))
      .map(function mapPosition(letter, index) { return letter ? null : index; })
      .filter(function present(index) { return index !== null; });
  }

  function revealExactPosition(game, sourceLabel) {
    var before = (game.state.revealedPositions || []).filter(Boolean).length;
    var message = typeof game._applyRewardEffect === "function"
      ? game._applyRewardEffect("revealLocation")
      : "";
    var after = (game.state.revealedPositions || []).filter(Boolean).length;
    if (!message && after <= before) return { ok: false, error: "Every position is already known." };
    game.state.lastMessage = (sourceLabel ? sourceLabel + ": " : "") + (message || "A correct letter and position were revealed.");
    return { ok: true, message: game.state.lastMessage, revealed: Math.max(0, after - before) };
  }

  function feedbackFor(answer, guess) {
    if (Engine && typeof Engine.evaluateFeedback === "function") {
      return Engine.evaluateFeedback(answer, guess);
    }
    if (window.CuddleQuestBook && typeof window.CuddleQuestBook.evaluateFeedback === "function") {
      return window.CuddleQuestBook.evaluateFeedback(answer, guess);
    }
    var result = Array(guess.length).fill("grey");
    var counts = Object.create(null);
    answer.split("").forEach(function count(letter) { counts[letter] = (counts[letter] || 0) + 1; });
    guess.split("").forEach(function greens(letter, index) {
      if (answer[index] === letter) {
        result[index] = "green";
        counts[letter] -= 1;
      }
    });
    guess.split("").forEach(function yellows(letter, index) {
      if (result[index] === "green") return;
      if ((counts[letter] || 0) > 0) {
        result[index] = "yellow";
        counts[letter] -= 1;
      }
    });
    return result;
  }

  function entryMatchesCandidate(candidate, entry) {
    if (!entry || entry.timedOut || !entry.word || entry.fakeFeedback) return true;
    var generated = feedbackFor(candidate, String(entry.word).toUpperCase());
    if (entry.bossCounts) {
      var greens = generated.filter(function green(value) { return value === "green"; }).length;
      var yellows = generated.filter(function yellow(value) { return value === "yellow"; }).length;
      return greens === integer(entry.bossCounts.green, -1)
        && yellows === integer(entry.bossCounts.yellow, -1);
    }
    var shown = Array.isArray(entry.shownFeedback) ? entry.shownFeedback : entry.feedback;
    if (!Array.isArray(shown)) return true;
    for (var index = 0; index < shown.length; index += 1) {
      var visible = shown[index];
      if (!visible || visible === "unknown" || visible === "purple") continue;
      if (visible === "blue") {
        if (generated[index] !== "green" && generated[index] !== "yellow") return false;
      } else if (generated[index] !== visible) {
        return false;
      }
    }
    return true;
  }

  function getPossibleAnswers(game) {
    var state = game.state || {};
    var source = typeof game.getActiveWords === "function" ? game.getActiveWords() : (game.secrets || []);
    var positions = Array.isArray(state.revealedPositions) ? state.revealedPositions : [];
    var present = unique(state.knownPresent || []);
    var absent = unique(state.knownAbsent || []);
    return source.filter(function candidateFits(candidate) {
      var word = String(candidate || "").toUpperCase();
      if (!/^[A-Z]{5}$/.test(word)) return false;
      for (var index = 0; index < positions.length; index += 1) {
        if (positions[index] && word[index] !== positions[index]) return false;
      }
      if (present.some(function missing(letter) { return !word.includes(letter); })) return false;
      if (absent.some(function forbidden(letter) { return word.includes(letter); })) return false;
      return (state.history || []).every(function match(entry) {
        return entryMatchesCandidate(word, entry);
      });
    });
  }

  function useHint(game) {
    var coach = ensureCoach(game);
    if (!coach || game.state.status !== "playing") return { ok: false, error: "Hints are only available during a round." };
    if (integer(game.state.round, 1) < coach.hintStartRound) {
      return { ok: false, error: "Hints begin in round " + coach.hintStartRound + "." };
    }
    if (coach.hintCharges <= 0) return { ok: false, error: "No hints remain this round." };
    if (!hiddenPositions(game).length) return { ok: false, error: "Every position is already known." };
    var result = revealExactPosition(game, "Guesser Hint");
    if (!result.ok) return result;
    coach.hintCharges -= 1;
    coach.hintsUsed += 1;
    coach.hintLettersRevealed += Math.max(1, integer(result.revealed, 1));
    var key = roundKey(game);
    if (coach.lastHintRoundKey !== key) {
      coach.lastHintRoundKey = key;
      coach.hintRoundsWithUse += 1;
    }
    save(game);
    requestRender(game);
    return result;
  }

  function useGoldenCompass(game) {
    var coach = ensureCoach(game);
    var key = roundKey(game);
    if (!hasBossReward(game, "goldenCompass")) return { ok: false, error: "Golden Compass is not unlocked." };
    if (game.state.status !== "playing") return { ok: false, error: "Golden Compass is only available during a round." };
    if (coach.goldenCompassUsedRoundKey === key) return { ok: false, error: "Golden Compass was already used this round." };
    var candidates = getPossibleAnswers(game);
    if (!candidates.length) return { ok: false, error: "No trustworthy candidate set is available yet." };
    var tested = new Set();
    (game.state.history || []).forEach(function collect(entry) {
      String(entry && entry.word || "").split("").forEach(function add(letter) { tested.add(letter); });
    });
    (game.state.knownAbsent || []).forEach(function add(letter) { tested.add(letter); });
    (game.state.knownPresent || []).forEach(function add(letter) { tested.add(letter); });
    (game.state.revealedPositions || []).filter(Boolean).forEach(function add(letter) { tested.add(letter); });
    var tally = ALPHABET.map(function score(letter) {
      return {
        letter: letter,
        count: candidates.reduce(function total(sum, word) { return sum + Number(word.includes(letter)); }, 0)
      };
    }).filter(function useful(item) { return !tested.has(item.letter) && item.count > 0; })
      .sort(function descending(a, b) { return b.count - a.count || a.letter.localeCompare(b.letter); });
    if (!tally.length) return { ok: false, error: "Every useful letter has already been tested." };
    var best = tally[0];
    var percentage = Math.round(best.count * 100 / candidates.length);
    coach.goldenCompassUsedRoundKey = key;
    coach.goldenCompassUses += 1;
    coach.lastCompassMessage = "Golden Compass points to " + best.letter + " — it appears in " + percentage + "% of the remaining answers.";
    game.state.lastMessage = coach.lastCompassMessage;
    save(game);
    requestRender(game);
    return { ok: true, message: coach.lastCompassMessage, letter: best.letter, percentage: percentage };
  }

  function applyUpgrade(game, upgradeId, source, recordHistory) {
    var coach = ensureCoach(game);
    if (recordHistory === undefined) recordHistory = true;
    var definition = UPGRADE_DEFINITIONS.find(function match(item) { return item.id === upgradeId; });
    if (!definition) return { ok: false, error: "Unknown Cuddle Coach upgrade." };
    if (definition.requiresHint && coach.hintsPerRound <= 0) {
      return { ok: false, error: "Unlock a Guesser Hint first." };
    }
    if (upgradeId === "coachPossibleAnswers") {
      if (coach.possibleAnswersUnlocked) return { ok: false, error: "Possible Answers is already unlocked." };
      coach.possibleAnswersUnlocked = true;
    } else if (upgradeId === "coachHint") {
      if (coach.hintsPerRound >= 4) return { ok: false, error: "Hints are already fully upgraded." };
      coach.hintsPerRound += 1;
      if (integer(game.state.round, 1) >= coach.hintStartRound && game.state.status === "playing") coach.hintCharges += 1;
    } else if (upgradeId === "coachEarlierHint") {
      if (coach.hintStartRound <= 1) return { ok: false, error: "Hints already begin in round 1." };
      var currentRound = integer(game.state.round, 1);
      // If this is taken before the ordinary end-of-round-three unlock, make
      // it useful on the very next numbered round rather than asking the
      // player to buy a timing reward that cannot affect the current run.
      coach.hintStartRound = Math.max(1, Math.min(coach.hintStartRound - 1, currentRound + 1));
      if (coach.hintsPerRound <= 0) coach.hintsPerRound = 1;
      if (currentRound >= coach.hintStartRound && game.state.status === "playing") {
        coach.hintCharges = Math.max(coach.hintCharges, coach.hintsPerRound);
      }
    } else if (upgradeId === "coachMeterThreshold") {
      if (coach.cuddleThresholdStacks >= 3) return { ok: false, error: "The Cuddle Meter is already at its minimum." };
      coach.cuddleThresholdStacks += 1;
    } else if (upgradeId === "coachMeterReward") {
      if (coach.cuddleRewardTier >= 3) return { ok: false, error: "The Cuddle Meter reward is already an extra row." };
      coach.cuddleRewardTier += 1;
    }
    if (recordHistory && Array.isArray(game.state.rewardBookHistory)) {
      game.state.rewardBookHistory.push({
        id: definition.id,
        icon: definition.icon,
        title: definition.title,
        description: definition.description,
        kind: source || "round",
        round: integer(game.state.round, 1)
      });
      game.state.rewardBookHistory = game.state.rewardBookHistory.slice(-60);
    }
    return { ok: true, definition: definition };
  }

  function upgradeIsMaxed(coach, definition) {
    if (definition.id === "coachPossibleAnswers") return coach.possibleAnswersUnlocked;
    if (definition.id === "coachHint") return coach.hintsPerRound >= definition.max;
    if (definition.id === "coachEarlierHint") return coach.hintStartRound <= 1;
    if (definition.id === "coachMeterThreshold") return coach.cuddleThresholdStacks >= definition.max;
    if (definition.id === "coachMeterReward") return coach.cuddleRewardTier >= definition.max;
    return false;
  }

  function eligibleUpgrades(game) {
    var coach = ensureCoach(game);
    return UPGRADE_DEFINITIONS.filter(function eligible(definition) {
      if (upgradeIsMaxed(coach, definition)) return false;
      if (definition.requiresHint && coach.hintsPerRound <= 0) return false;
      return true;
    }).map(function clone(definition) { return Object.assign({}, definition); });
  }

  function recordGreyTilesAndGrant(game) {
    var coach = ensureCoach(game);
    if (!coach) return [];
    var newlyVisible = 0;
    (game.state.history || []).forEach(function countEntry(entry) {
      if (!entry) return;
      var shown = Array.isArray(entry.shownFeedback) ? entry.shownFeedback : (entry.feedback || []);
      var visibleGreys = shown.filter(function grey(value) { return value === "grey"; }).length;
      var alreadyCounted = Math.max(0, integer(entry.cuddleCoachGreyCounted, 0));
      if (visibleGreys <= alreadyCounted) return;
      newlyVisible += visibleGreys - alreadyCounted;
      entry.cuddleCoachGreyCounted = visibleGreys;
    });
    if (!newlyVisible) return [];
    coach.cuddleGreysCollected += newlyVisible;
    coach.cuddleProgress += newlyVisible;
    var messages = [];
    var threshold = meterThreshold(coach);
    while (coach.cuddleProgress >= threshold) {
      coach.cuddleProgress -= threshold;
      coach.cuddleTriggers += 1;
      var tier = clamp(integer(coach.cuddleRewardTier, 0), 0, 3);
      var popLabel = "";
      if (tier === 0) {
        if (game.state.status === "playing" && !game.state.pendingRoundEnd) {
          game.state.mulligansLeft = Math.max(0, integer(game.state.mulligansLeft, 0)) + 1;
          messages.push("Cuddle Meter full: +1 free mulligan.");
          popLabel = "+1 mulligan";
        } else {
          coach.bankedMulligans += 1;
          messages.push("Cuddle Meter full: a free mulligan is banked for the next round.");
          popLabel = "+1 mulligan (banked)";
        }
        coach.cuddleRewards.mulligan += 1;
      } else if (tier === 1) {
        var jokerMessage = typeof game._applyRewardEffect === "function" ? game._applyRewardEffect("jokerToken") : "";
        messages.push("Cuddle Meter full: " + (jokerMessage || "gained a Joker."));
        coach.cuddleRewards.joker += 1;
        popLabel = "+1 joker";
      } else if (tier === 2) {
        if (hiddenPositions(game).length) {
          var letter = revealExactPosition(game, "Cuddle Meter");
          messages.push(letter.message || "Cuddle Meter revealed a free letter.");
          popLabel = "free letter";
        } else {
          coach.bankedFreeLetters += 1;
          messages.push("Cuddle Meter full: a free letter is banked for the next round.");
          popLabel = "free letter (banked)";
        }
        coach.cuddleRewards.letter += 1;
      } else {
        if (game.state.pendingRoundEnd?.type === "outOfGuesses") {
          game.state.maxGuesses = Math.max(1, integer(game.state.maxGuesses, 6) + 1);
          game.state.pendingRoundEnd = null;
          game.state.status = "playing";
          game.state.failureReason = null;
          if (typeof game._ensureQuestForNextGuess === "function") game._ensureQuestForNextGuess();
          messages.push("Cuddle Meter full: an extra rescue row opened.");
          popLabel = "rescue row";
        } else if (game.state.status === "playing" && !game.state.pendingRoundEnd) {
          game.state.maxGuesses = Math.max(1, integer(game.state.maxGuesses, 6) + 1);
          messages.push("Cuddle Meter full: +1 extra row this round.");
          popLabel = "+1 row";
        } else {
          coach.bankedExtraRows += 1;
          messages.push("Cuddle Meter full: an extra row is banked for the next round.");
          popLabel = "+1 row (banked)";
        }
        coach.cuddleRewards.row += 1;
      }
      coach.lastMeterReward = { seq: coach.cuddleTriggers, label: popLabel };
      threshold = meterThreshold(coach);
    }
    if (messages.length) game.state.lastMessage = ((game.state.lastMessage || "") + " " + messages.join(" ")).trim();
    return messages;
  }

  function applyBankedCuddles(game, coach, notes) {
    if (coach.bankedMulligans > 0) {
      game.state.mulligansLeft = Math.max(0, integer(game.state.mulligansLeft, 0)) + coach.bankedMulligans;
      notes.push("Banked Cuddle Meter: +" + coach.bankedMulligans + " mulligan" + (coach.bankedMulligans === 1 ? "" : "s") + ".");
      coach.bankedMulligans = 0;
    }
    while (coach.bankedFreeLetters > 0 && hiddenPositions(game).length) {
      var result = revealExactPosition(game, "Banked Cuddle Meter");
      if (!result.ok) break;
      notes.push(result.message);
      coach.bankedFreeLetters -= 1;
    }
    if (coach.bankedExtraRows > 0) {
      game.state.maxGuesses = Math.max(1, integer(game.state.maxGuesses, 6) + coach.bankedExtraRows);
      notes.push("Banked Cuddle Meter: +" + coach.bankedExtraRows + " extra row" + (coach.bankedExtraRows === 1 ? "" : "s") + ".");
      coach.bankedExtraRows = 0;
    }
  }

  function chooseCullLetters(game, count) {
    var secretLetters = new Set(String(game.state.secret || "").toUpperCase().split(""));
    var permanentRemoved = new Set(game.state.removedLetters || []);
    var pool = ALPHABET.filter(function candidate(letter) {
      return !VOWELS.has(letter) && !secretLetters.has(letter) && !permanentRemoved.has(letter);
    });
    return shuffle(pool, game).slice(0, Math.min(count, pool.length));
  }

  function applyTemporaryCull(game, letters) {
    var blocked = new Set(letters);
    game.state.knownAbsent = unique([].concat(game.state.knownAbsent || [], letters)).sort();
    ["hand", "deck", "discard"].forEach(function filterPile(key) {
      if (!Array.isArray(game.state[key])) return;
      game.state[key] = game.state[key].filter(function keep(card) {
        return !blocked.has(String(card && card.glyph || "").toUpperCase());
      });
    });
    game.state.draft = [];
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
    if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
  }

  function consumeNextBossKit(game, coach) {
    if (!game.isBossRound || !game.isBossRound()) return [];
    var key = roundKey(game);
    if (coach.activeBossKit && coach.activeBossKit.key === key) return [];
    var active = defaultActiveBossKit();
    active.key = key;
    var notes = [];
    Object.keys(defaultInventory()).forEach(function consume(inventoryKey) {
      if (inventoryKey === "bossReroll") return;
      if (integer(coach.inventory[inventoryKey], 0) <= 0) return;
      coach.inventory[inventoryKey] -= 1;
      active[inventoryKey] = true;
    });
    coach.activeBossKit = active;

    if (active.extraRow) {
      game.state.maxGuesses = Math.max(1, integer(game.state.maxGuesses, 6) + 1);
      notes.push("Boss Breathing Room added one row.");
    }
    if (active.openingGreen) {
      var green = revealExactPosition(game, "Opening Green");
      notes.push(green.message || "Opening Green revealed one exact position.");
    }
    if (active.tenLetterCull) {
      active.culledLetters = chooseCullLetters(game, 10);
      applyTemporaryCull(game, active.culledLetters);
      notes.push("Ten-Letter Cull removed " + active.culledLetters.join(", ") + " for this boss.");
    }
    if (active.unlimitedMulligans) {
      game.state.mulligansLeft = 999;
      notes.push("Unlimited mulligans are active for this boss.");
    }
    if (active.revealThemes && window.CuddleCampaign?.queueCategoryReveal) {
      notes.push(window.CuddleCampaign.queueCategoryReveal(game, 3, "shop") || "Theme reveal requested.");
    }
    if (active.autoQuests) notes.push("Quest Autopilot is active: every boss guess completes its quest.");
    if (active.doubleQuestRewards) notes.push("Double Quest Rewards is active for this boss.");
    return notes;
  }

  function initializeRound(game, force) {
    var coach = ensureCoach(game);
    if (!coach || !game.state || !game.state.secret) return;
    var key = roundKey(game);
    if (!force && coach.roundKey === key) return;
    coach.roundKey = key;
    coach.goldenCompassUsedRoundKey = null;
    coach.lastCompassMessage = "";
    coach.hintCharges = integer(game.state.round, 1) >= coach.hintStartRound ? coach.hintsPerRound : 0;
    coach.activeBossKit = defaultActiveBossKit();
    var notes = [];
    applyBankedCuddles(game, coach, notes);
    notes = notes.concat(consumeNextBossKit(game, coach));
    if (notes.length) game.state.lastMessage = ((game.state.lastMessage || "") + " " + notes.join(" ")).trim();
  }

  function currentShopRound(game) {
    var campaign = window.CuddleCampaign?.ensureCampaign?.(game);
    return campaign && campaign.activeShopRound != null ? String(campaign.activeShopRound) : String(game.state.round || 0);
  }

  function getShopDefinition(itemId) {
    return SHOP_ITEMS.find(function match(item) { return item.id === itemId; }) || null;
  }

  function buyCoachShopItem(game, item) {
    if (game.state.status !== "shop") return { ok: false, error: "No shop is open." };
    var coach = ensureCoach(game);
    var purchaseKey = currentShopRound(game);
    var purchases = Array.isArray(coach.shopPurchases[purchaseKey]) ? coach.shopPurchases[purchaseKey] : [];
    if (purchases.includes(item.id)) return { ok: false, error: "That item is sold out in this shop." };
    if (finite(game.state.score, 0) < item.cost) return { ok: false, error: "You need $" + item.cost + "." };
    if (item.kind === "permanent") {
      var upgrade = UPGRADE_DEFINITIONS.find(function match(definition) { return definition.id === item.upgradeId; });
      if (!upgrade) return { ok: false, error: "That permanent upgrade is unavailable." };
      if (upgradeIsMaxed(coach, upgrade)) return { ok: false, error: "That permanent upgrade is already maxed." };
      if (upgrade.requiresHint && coach.hintsPerRound <= 0) return { ok: false, error: "Unlock a Guesser Hint first." };
    }
    game.state.score -= item.cost;
    purchases.push(item.id);
    coach.shopPurchases[purchaseKey] = purchases;
    if (item.kind === "consumable") {
      coach.inventory[item.inventoryKey] = Math.max(0, integer(coach.inventory[item.inventoryKey], 0)) + 1;
    } else {
      var applied = applyUpgrade(game, item.upgradeId, "shop");
      if (!applied.ok) {
        game.state.score += item.cost;
        purchases.splice(purchases.indexOf(item.id), 1);
        return applied;
      }
    }
    game.state.lastMessage = item.title + " purchased for $" + item.cost + ".";
    save(game);
    return { ok: true, message: game.state.lastMessage };
  }

  function nextCustomBossReward(game) {
    var coach = ensureCoach(game);
    var missing = BOSS_REWARDS.filter(function missingReward(reward) {
      return !coach.newBossRewardsOwned.includes(reward.id);
    });
    if (!missing.length) missing = BOSS_REWARDS.slice();
    var index = Math.max(0, integer(game.state.bossesCleared, 0)) % missing.length;
    return missing[index] || missing[0];
  }

  function decorateBossOffer(game) {
    if (game.state.status !== "bossChoice" || !Array.isArray(game.state.bossOffer) || !game.state.bossOffer.length) return;
    var reward = nextCustomBossReward(game);
    game.state.bossOffer = game.state.bossOffer.map(function decorate(option, index) {
      if (index !== 0) return option;
      return Object.assign({}, option, { rewardId: reward.id, reward: Object.assign({}, reward) });
    });
  }

  function rerollBoss(game) {
    var coach = ensureCoach(game);
    if (!coach || game.state.status !== "bossChoice") return { ok: false, error: "No boss choice is open." };
    if (coach.inventory.bossReroll <= 0) return { ok: false, error: "No Boss Reroll is stored." };
    var current = Array.isArray(game.state.bossOffer) ? game.state.bossOffer.slice() : [];
    var gate = current[0] && current[0].gate;
    var excluded = unique([].concat(game.state.bossesSeen || [], current.map(function id(option) { return option.id; })));
    var choices = window.CuddleQuestBook?.bossChoices?.(game.random, excluded) || [];
    if (choices.length < 2) {
      choices = window.CuddleQuestBook?.bossChoices?.(game.random, current.map(function id(option) { return option.id; })) || [];
    }
    if (choices.length < 2) return { ok: false, error: "No different boss pair was available." };
    game.state.bossOffer = choices.slice(0, 2).map(function preserveStage(choice, index) {
      var previous = current[index] || current[0] || {};
      return Object.assign({}, choice, {
        gate: gate,
        turns: previous.turns || choice.turns,
        secondsPerGuess: choice.id === "quickMode" ? (previous.secondsPerGuess || choice.secondsPerGuess || 60) : choice.secondsPerGuess
      });
    });
    decorateBossOffer(game);
    coach.inventory.bossReroll -= 1;
    coach.bossRerollsUsed += 1;
    game.state.lastMessage = "Boss Reroll drew two new opponents.";
    save(game);
    requestRender(game);
    return { ok: true, message: game.state.lastMessage };
  }

  function rowMoneyWithoutUnusedBonus(entry) {
    if (!entry) return 0;
    return finite(entry.scoreDelta, 0)
      + finite(entry.questBonus, 0)
      + finite(entry.questFinalBonus, 0)
      + finite(entry.mulliganBonus, 0)
      + finite(entry.cuddleQuestBonus, 0)
      + finite(entry.cuddleSolveBonus, 0)
      + finite(entry.challengeBonus, 0)
      + finite(entry.coachDoubleQuestBonus, 0)
      - finite(entry.questTrialPenalty, 0)
      - finite(entry.ratchetQuestPenalty, 0);
  }

  function rebuildPendingPayout(game, unusedRows, perRow) {
    var moneyMode = game.state.cuddleMoneyMode;
    var payload = moneyMode && moneyMode.pendingPayout;
    if (!payload || !Array.isArray(payload.rows)) return;
    var history = Array.isArray(game.state.history) ? game.state.history : [];
    payload.rows = history.map(function realRow(entry, index) {
      return {
        index: index,
        word: String(entry && entry.word || "").toUpperCase(),
        feedback: (entry && (entry.shownFeedback || entry.feedback) || []).slice(),
        timedOut: Boolean(entry && entry.timedOut),
        amount: Math.round(rowMoneyWithoutUnusedBonus(entry))
      };
    });
    for (var index = 0; index < unusedRows; index += 1) {
      payload.rows.push({
        index: "unused-" + index,
        word: "BONUS",
        feedback: ["green", "green", "green", "green", "green"],
        timedOut: false,
        amount: Math.round(perRow),
        bonusRow: true,
        unusedRowNumber: index + 1
      });
    }
    payload.to = Math.round(finite(game.state.score, 0));
    payload.total = Math.round(payload.to - finite(payload.from, 0));
    var allocated = payload.rows.reduce(function sum(total, row) { return total + finite(row.amount, 0); }, 0);
    if (payload.rows.length && allocated !== payload.total) {
      var realIndex = Math.max(0, history.length - 1);
      payload.rows[realIndex].amount += payload.total - allocated;
    }
  }

  function applyUnusedRowMoney(game, entry, maxGuessesBefore) {
    var coach = ensureCoach(game);
    var rules = typeof game.getRulesSummary === "function" ? game.getRulesSummary() : {};
    var unusedRows = Math.max(0, integer(maxGuessesBefore, 6) - integer(game.state.guessesUsed, 0));
    var perRow = Math.max(0, 5 * finite(rules.greenPoints, 2) + finite(rules.earlyPoint, 10));
    var desired = Math.round(unusedRows * perRow);
    var previous = Math.round(finite(entry && entry.earlyBonus, 0));
    var adjustment = desired - previous;
    if (entry) {
      entry.legacyEarlyBonus = previous;
      entry.earlyBonus = 0;
      entry.unusedRows = unusedRows;
      entry.unusedRowValue = perRow;
      entry.unusedRowBonus = desired;
    }
    game.state.score = finite(game.state.score, 0) + adjustment;
    game.state.roundScore = finite(game.state.roundScore, 0) + adjustment;
    if (game.state.pendingRoundEnd) {
      game.state.pendingRoundEnd.score = game.state.score;
      game.state.pendingRoundEnd.earlyBonus = desired;
    }
    if (game.state.lastRoundSummary) {
      game.state.lastRoundSummary.score = game.state.score;
      game.state.lastRoundSummary.roundScore = game.state.roundScore;
      game.state.lastRoundSummary.earlyBonus = desired;
      game.state.lastRoundSummary.unusedRows = unusedRows;
      game.state.lastRoundSummary.unusedRowValue = perRow;
    }
    coach.unusedRowsPaid += unusedRows;
    coach.unusedRowMoney += desired;
    coach.lastUnusedRows = unusedRows;
    coach.lastUnusedRowMoney = desired;
    if (unusedRows > 0) {
      game.state.lastMessage = ((game.state.lastMessage || "") + " " + unusedRows + " unused row" + (unusedRows === 1 ? "" : "s") + " paid " + formatMoney(desired) + " (" + formatMoney(perRow) + " each).").trim();
    }
    rebuildPendingPayout(game, unusedRows, perRow);
  }

  function applyDoubleQuestReward(game, entry, wasBoss, activeBefore) {
    if (!activeBefore || !activeBefore.doubleQuestRewards || !entry || !entry.questComplete) return;
    if (game.state.status === "questReward") {
      game.state.questRewardPicksRemaining = Math.max(2, integer(game.state.questRewardPicksRemaining, 1));
    }
    if (!wasBoss) {
      var base = finite(entry.questBonus, 0) + finite(entry.questFinalBonus, 0);
      if (base > 0 && !entry.coachDoubleQuestBonus) {
        entry.coachDoubleQuestBonus = base;
        game.state.score += base;
        game.state.roundScore += base;
        if (game.state.pendingRoundEnd) game.state.pendingRoundEnd.score = game.state.score;
      }
    }
  }

  function rescueOutOfGuesses(game) {
    var coach = ensureCoach(game);
    if (!game.state.pendingRoundEnd || game.state.pendingRoundEnd.type !== "outOfGuesses") return false;
    recordGreyTilesAndGrant(game);
    if (!game.state.pendingRoundEnd) return true;
    if (hasBossReward(game, "secondCup") && !coach.secondCupUsed) {
      coach.secondCupUsed = true;
      game.state.maxGuesses = Math.max(1, integer(game.state.maxGuesses, 6) + 1);
      game.state.pendingRoundEnd = null;
      game.state.status = "playing";
      game.state.failureReason = null;
      game.state.lastMessage = ((game.state.lastMessage || "") + " Second Cup opened one final rescue row.").trim();
      if (typeof game._ensureQuestForNextGuess === "function") game._ensureQuestForNextGuess();
      save(game);
      return true;
    }
    return false;
  }

  function installQuestBookExtensions() {
    var book = window.CuddleQuestBook;
    if (!book || book.__cuddleCoachExpansion) return;
    var originalEvaluate = book.evaluateQuest;
    var originalGetBossReward = book.getBossReward;
    var combinedRewards = unique([].concat(book.BOSS_REWARDS || [], BOSS_REWARDS).map(function key(item) { return item && item.id; }))
      .map(function recover(id) {
        return BOSS_REWARDS.find(function custom(item) { return item.id === id; })
          || (book.BOSS_REWARDS || []).find(function original(item) { return item.id === id; });
      }).filter(Boolean);
    var replacement = Object.assign({}, book, {
      __cuddleCoachExpansion: true,
      BOSS_REWARDS: combinedRewards,
      getBossReward: function getBossRewardCoach(rewardId) {
        return BOSS_REWARDS.find(function match(item) { return item.id === rewardId; })
          || (typeof originalGetBossReward === "function" ? originalGetBossReward.call(book, rewardId) : null);
      },
      evaluateQuest: function evaluateQuestCoach(quest, context) {
        var game = activeGame;
        var coach = game && game.state ? ensureCoach(game) : null;
        if (coach && coach.activeBossKit && coach.activeBossKit.autoQuests && game.isBossRound && game.isBossRound()) return true;
        return typeof originalEvaluate === "function" ? originalEvaluate.call(book, quest, context) : false;
      }
    });
    window.CuddleQuestBook = Object.freeze(replacement);
  }

  installQuestBookExtensions();

  var originalHydrate = proto._hydrateState;
  proto._hydrateState = function hydrateCuddleCoachExpansion() {
    var result = typeof originalHydrate === "function" ? originalHydrate.apply(this, arguments) : undefined;
    ensureCoach(this);
    activateGame(this);
    if (this.state?.status === "bossChoice") decorateBossOffer(this);
    initializeRound(this, false);
    return result;
  };

  var originalLoad = Game.load;
  if (typeof originalLoad === "function") {
    Game.load = function loadCuddleCoachExpansion() {
      var game = originalLoad.apply(this, arguments);
      if (game) {
        activateGame(game);
        if (game.state?.status === "bossChoice") decorateBossOffer(game);
        initializeRound(game, false);
      }
      return game;
    };
  }

  var originalStartNew = proto.startNew;
  proto.startNew = function startNewCuddleCoachExpansion() {
    var result = originalStartNew.apply(this, arguments);
    resetCoachForNewRun(this);
    activateGame(this);
    initializeRound(this, true);
    save(this);
    return typeof this.getSnapshot === "function" ? this.getSnapshot() : result;
  };

  var originalBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundCuddleCoachExpansion() {
    var result = originalBeginRound.apply(this, arguments);
    activateGame(this);
    initializeRound(this, true);
    save(this);
    return result;
  };

  var originalBaseDeckGlyphs = proto._baseDeckGlyphs;
  if (typeof originalBaseDeckGlyphs === "function") {
    proto._baseDeckGlyphs = function baseDeckGlyphsCuddleCoachExpansion() {
      var glyphs = originalBaseDeckGlyphs.apply(this, arguments) || [];
      var coach = ensureCoach(this);
      var culled = new Set(coach && coach.activeBossKit && coach.activeBossKit.culledLetters || []);
      if (!culled.size || !this.isBossRound || !this.isBossRound()) return glyphs;
      return glyphs.filter(function keepGlyph(letter) { return !culled.has(String(letter || "").toUpperCase()); });
    };
  }

  var originalGetActiveWords = proto.getActiveWords;
  proto.getActiveWords = function getActiveWordsCuddleCoachExpansion() {
    var words = typeof originalGetActiveWords === "function" ? originalGetActiveWords.apply(this, arguments) : (this.secrets || []).slice();
    var coach = ensureCoach(this);
    var culled = new Set(coach && coach.activeBossKit && coach.activeBossKit.culledLetters || []);
    if (!culled.size || !this.isBossRound || !this.isBossRound()) return words;
    return words.filter(function keep(word) {
      return !Array.from(culled).some(function blocked(letter) { return word.includes(letter); });
    });
  };

  var originalUpgradeCatalog = proto._upgradeCatalog;
  proto._upgradeCatalog = function upgradeCatalogCuddleCoachExpansion() {
    var base = typeof originalUpgradeCatalog === "function" ? originalUpgradeCatalog.apply(this, arguments) : [];
    if (this.state?.upgradePhase !== "round") return base;
    var existing = new Set((base || []).map(function id(item) { return item && item.id; }));
    return (base || []).concat(eligibleUpgrades(this).filter(function notDuplicate(item) { return !existing.has(item.id); }));
  };

  function isNormalRoundThreeReward(game) {
    return game.state?.upgradePhase === "round"
      && integer(game.state?.lastRoundSummary?.round, 0) === 3
      && !game.state?.lastClearedBossGate;
  }

  var originalGenerateUpgradeChoices = proto._generateUpgradeChoices;
  proto._generateUpgradeChoices = function generateUpgradeChoicesCuddleCoachExpansion() {
    var choices = typeof originalGenerateUpgradeChoices === "function" ? originalGenerateUpgradeChoices.apply(this, arguments) : [];
    choices = Array.isArray(choices) ? choices.slice() : [];
    var coach = ensureCoach(this);
    var clearedRound = integer(this.state?.lastRoundSummary?.round, 0);
    if (isNormalRoundThreeReward(this) && clearedRound === 3 && coach.hintsPerRound <= 0) {
      var forced = UPGRADE_DEFINITIONS.find(function hint(item) { return item.id === "coachHint"; });
      if (!choices.some(function already(item) { return item && item.id === forced.id; })) {
        if (choices.length) choices[choices.length - 1] = Object.assign({}, forced);
        else choices.push(Object.assign({}, forced));
      }
      coach.roundThreeHintForced = true;
    }
    return choices;
  };

  var originalRefreshUpgradeChoices = proto.refreshUpgradeChoices;
  if (typeof originalRefreshUpgradeChoices === "function") {
    proto.refreshUpgradeChoices = function refreshUpgradeChoicesCuddleCoachExpansion() {
      var result = originalRefreshUpgradeChoices.apply(this, arguments);
      if (result?.ok && isNormalRoundThreeReward(this)
          && ensureCoach(this).hintsPerRound <= 0) {
        var forced = UPGRADE_DEFINITIONS.find(function hint(item) { return item.id === "coachHint"; });
        if (!this.state.upgradeChoices.some(function already(item) { return item && item.id === forced.id; })) {
          if (this.state.upgradeChoices.length) this.state.upgradeChoices[this.state.upgradeChoices.length - 1] = Object.assign({}, forced);
          else this.state.upgradeChoices.push(Object.assign({}, forced));
          save(this);
        }
      }
      return result;
    };
  }

  var originalChooseUpgrade = proto.chooseUpgrade;
  proto.chooseUpgrade = function chooseUpgradeCuddleCoachExpansion(choiceKey) {
    if (this.state?.status !== "upgrade") return originalChooseUpgrade.apply(this, arguments);
    var choice = (this.state.upgradeChoices || []).find(function match(item) { return item && item.key === choiceKey; });
    var custom = choice && UPGRADE_DEFINITIONS.find(function match(item) { return item.id === choice.id; });
    if (!custom) return originalChooseUpgrade.apply(this, arguments);
    var phase = this.state.upgradePhase;
    if (phase !== "round") return { ok: false, error: "This Cuddle Coach reward is only offered between completed rounds." };
    var echoArmed = Boolean(this.state.pendingRewardEcho);
    var result = applyUpgrade(this, custom.id, "round", true);
    if (!result.ok) return result;
    var applications = 1;
    if (echoArmed) {
      this.state.pendingRewardEcho = false;
      // Reward Echo lives in the existing engine. Custom Coach rewards are
      // handled by this outer extension, so replay their effect explicitly
      // rather than silently consuming or bypassing an armed Echo.
      for (var echo = 0; echo < 2; echo += 1) {
        var repeated = applyUpgrade(this, custom.id, "echo", false);
        if (!repeated.ok) break;
        applications += 1;
      }
    }
    this.state.lastMessage = custom.title + " acquired."
      + (echoArmed ? " Reward Echo applied it " + applications + " time" + (applications === 1 ? "" : "s") + "." : "");
    this.state.upgradeChoices = [];
    this.state.upgradePhase = null;
    this.state.upgradeMilestone = null;
    if (typeof this._advanceRound === "function") this._advanceRound();
    save(this);
    requestRender(this);
    return { ok: true, message: this.state.lastMessage };
  };

  var originalGetUpgradeSummary = proto.getUpgradeSummary;
  if (typeof originalGetUpgradeSummary === "function") {
    proto.getUpgradeSummary = function getUpgradeSummaryCuddleCoachExpansion() {
      var lines = originalGetUpgradeSummary.apply(this, arguments) || [];
      var coach = ensureCoach(this);
      lines = lines.slice();
      lines.push("Possible answers: " + (coach.possibleAnswersUnlocked ? "unlocked" : "locked"));
      lines.push("Hints: " + coach.hintsPerRound + " per round from round " + coach.hintStartRound);
      if (coach.newBossRewardsOwned.length) lines.push("Coach boss rewards: " + coach.newBossRewardsOwned.join(", "));
      return lines;
    };
  }

  var originalGetShop = proto.getCuddleShop;
  if (typeof originalGetShop === "function") {
    proto.getCuddleShop = function getCuddleShopCoachExpansion() {
      var shop = originalGetShop.apply(this, arguments);
      var coach = ensureCoach(this);
      var purchaseKey = currentShopRound(this);
      var purchases = new Set(coach.shopPurchases[purchaseKey] || []);
      var money = finite(this.state.score, 0);
      var extra = SHOP_ITEMS.map(function build(item) {
        var maxed = false;
        if (item.kind === "permanent") {
          var definition = UPGRADE_DEFINITIONS.find(function match(def) { return def.id === item.upgradeId; });
          maxed = definition ? upgradeIsMaxed(coach, definition) : true;
          if (definition?.requiresHint && coach.hintsPerRound <= 0) maxed = true;
        }
        return Object.assign({}, item, {
          purchased: purchases.has(item.id) || maxed,
          affordable: money >= item.cost && !maxed,
          coachKind: item.kind
        });
      });
      return Object.assign({}, shop, { items: (shop.items || []).concat(extra) });
    };
  }

  var originalBuyShopItem = proto.buyCuddleShopItem;
  if (typeof originalBuyShopItem === "function") {
    proto.buyCuddleShopItem = function buyCuddleShopItemCoachExpansion(itemId) {
      var custom = getShopDefinition(itemId);
      if (!custom) return originalBuyShopItem.apply(this, arguments);
      return buyCoachShopItem(this, custom);
    };
  }

  var originalOpenBossGate = proto._openBossGate;
  proto._openBossGate = function openBossGateCuddleCoachExpansion() {
    var opened = originalOpenBossGate.apply(this, arguments);
    if (opened) {
      activateGame(this);
      decorateBossOffer(this);
      save(this);
    }
    return opened;
  };

  proto.rerollCuddleBoss = function rerollCuddleBoss() {
    return rerollBoss(this);
  };

  var originalApplyBossReward = proto._applyBossReward;
  proto._applyBossReward = function applyBossRewardCuddleCoachExpansion(rewardId) {
    var reward = BOSS_REWARDS.find(function match(item) { return item.id === rewardId; });
    if (!reward) return originalApplyBossReward.apply(this, arguments);
    var coach = ensureCoach(this);
    if (!coach.newBossRewardsOwned.includes(rewardId)) coach.newBossRewardsOwned.push(rewardId);
    if (rewardId === "secondCup") coach.secondCupUsed = false;
    return reward.title + " unlocked. " + reward.description;
  };

  var originalEnsureQuest = proto._ensureQuestForNextGuess;
  proto._ensureQuestForNextGuess = function ensureQuestCuddleCoachExpansion() {
    var result = originalEnsureQuest.apply(this, arguments);
    var coach = ensureCoach(this);
    if (!coach?.activeBossKit?.autoQuests || !this.isBossRound || !this.isBossRound()
        || this.state.status !== "playing" || this.state.activeQuest) return result;
    var nextGuess = integer(this.state.guessesUsed, 0) + 1;
    var max = typeof this._effectiveMaxGuesses === "function" ? this._effectiveMaxGuesses() : integer(this.state.maxGuesses, 6);
    if (nextGuess > max) return result;
    this.state.activeQuest = window.CuddleQuestBook?.createQuest?.({
      feasibleWords: typeof this.getFeasibleWords === "function" ? this.getFeasibleWords() : [],
      secret: this.state.secret,
      history: this.state.history,
      knownAbsent: this.state.knownAbsent,
      knownPresent: this.state.knownPresent,
      revealedPositions: this.state.revealedPositions,
      rareLetters: typeof this.getRareLetters === "function" ? this.getRareLetters() : [],
      random: this.random
    }) || {
      id: "coachAutoQuest",
      icon: "✅",
      title: "Quest Autopilot",
      description: "Submit any valid five-letter word. This quest auto-completes."
    };
    return result;
  };

  var originalMulligan = proto.mulligan;
  proto.mulligan = function mulliganCuddleCoachExpansion(cardIds) {
    var coach = ensureCoach(this);
    var unlimited = Boolean(coach?.activeBossKit?.unlimitedMulligans && this.isBossRound && this.isBossRound());
    if (!unlimited) return originalMulligan.apply(this, arguments);
    var oldBoss = this.state.boss;
    var oldMulligans = this.state.mulligansLeft;
    this.state.mulligansLeft = Math.max(999, integer(oldMulligans, 0));
    if (oldBoss?.id === "noMulligans") this.state.boss = Object.assign({}, oldBoss, { id: "coachUnlimitedMulligans" });
    var result;
    try {
      result = originalMulligan.call(this, cardIds);
    } finally {
      this.state.boss = oldBoss;
      this.state.mulligansLeft = 999;
    }
    if (result?.ok) {
      this.state.lastMessage = "Unlimited boss mulligan used.";
      save(this);
    }
    return result;
  };

  var originalResolvePending = proto._resolvePendingRoundEnd;
  proto._resolvePendingRoundEnd = function resolvePendingCuddleCoachExpansion() {
    activateGame(this);
    recordGreyTilesAndGrant(this);
    if (rescueOutOfGuesses(this)) {
      requestRender(this);
      return undefined;
    }
    return originalResolvePending.apply(this, arguments);
  };

  var originalSubmitDraft = proto.submitDraft;
  proto.submitDraft = function submitDraftCuddleCoachExpansion() {
    activateGame(this);
    var wasBoss = Boolean(this.isBossRound && this.isBossRound());
    var maxBefore = typeof this._effectiveMaxGuesses === "function" ? this._effectiveMaxGuesses() : integer(this.state.maxGuesses, 6);
    var coachBefore = ensureCoach(this);
    var activeBefore = Object.assign({}, coachBefore.activeBossKit || {});
    var result = originalSubmitDraft.apply(this, arguments);
    if (!result?.ok) return result;
    var entry = this.state.history && this.state.history[this.state.history.length - 1];
    recordGreyTilesAndGrant(this);
    applyDoubleQuestReward(this, entry, wasBoss, activeBefore);
    if (result.solved && !wasBoss && entry) applyUnusedRowMoney(this, entry, maxBefore);
    if (activeBefore.doubleQuestRewards && entry?.questComplete && this.state.status === "questReward") {
      this.state.questRewardPicksRemaining = Math.max(2, integer(this.state.questRewardPicksRemaining, 1));
    }
    save(this);
    queueUi();
    return result;
  };

  var originalForfeit = proto.forfeitGuess;
  if (typeof originalForfeit === "function") {
    proto.forfeitGuess = function forfeitGuessCuddleCoachExpansion() {
      activateGame(this);
      var result = originalForfeit.apply(this, arguments);
      if (result?.ok) {
        recordGreyTilesAndGrant(this);
        save(this);
      }
      return result;
    };
  }

  function insertAfter(reference, element) {
    if (!reference || !reference.parentNode) return;
    reference.parentNode.insertBefore(element, reference.nextSibling);
  }

  function makeElement(html) {
    var template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function renderCoachPanel(game, coach) {
    var root = document.getElementById("cuddleRoot");
    if (!root) return;
    var board = root.querySelector(".cuddle-board");
    var existing = document.getElementById("cuddleCoachPanel");
    if (!board || game.state.status !== "playing") {
      if (existing) existing.remove();
      return;
    }
    var candidates = coach.possibleAnswersUnlocked ? getPossibleAnswers(game) : [];
    var threshold = meterThreshold(coach);
    var hintsEligible = integer(game.state.round, 1) >= coach.hintStartRound;
    var hintDisabled = !hintsEligible || coach.hintCharges <= 0 || hiddenPositions(game).length <= 0;
    var compassOwned = hasBossReward(game, "goldenCompass");
    var compassUsed = coach.goldenCompassUsedRoundKey === roundKey(game);
    var signature = JSON.stringify({
      round: game.state.round,
      status: game.state.status,
      candidates: coach.possibleAnswersUnlocked ? candidates.length : null,
      possible: coach.possibleAnswersUnlocked,
      meter: coach.cuddleProgress,
      threshold: threshold,
      tier: coach.cuddleRewardTier,
      hints: coach.hintsPerRound,
      charges: coach.hintCharges,
      hintStart: coach.hintStartRound,
      hidden: hiddenPositions(game).length,
      compass: compassOwned,
      compassUsed: compassUsed,
      hintsUsed: coach.hintsUsed,
      hintRounds: coach.hintRoundsWithUse,
      greys: coach.cuddleGreysCollected,
      fills: coach.cuddleTriggers,
      unusedRows: coach.unusedRowsPaid,
      unusedMoney: coach.unusedRowMoney
    });
    if (existing && existing.dataset.coachSignature === signature) return;
    var html = "<aside id=\"cuddleCoachPanel\" class=\"cuddle-coach-panel\" data-coach-signature=\"" + escapeHtml(signature) + "\" aria-label=\"Cuddle assistance and statistics\">";
    if (coach.possibleAnswersUnlocked) {
      html += "<section id=\"cuddleCoachRemainingBox\" class=\"remaining-box cuddle-coach-remaining-box\">"
        + "<div class=\"line\"><span class=\"label\">🎧 Possible answers</span><span class=\"value\">" + candidates.length.toLocaleString() + "</span></div>"
        + "<div class=\"line remaining-hint\"><span class=\"label\">Matches visible feedback</span><span class=\"value\">exact</span></div></section>";
    }
    if (coach.hintsPerRound > 0 || compassOwned) {
      html += "<section class=\"cuddle-coach-actions\">";
      if (coach.hintsPerRound > 0) {
        html += "<button type=\"button\" class=\"cuddle-coach-action\" data-cuddle-coach-action=\"use-hint\" " + (hintDisabled ? "disabled" : "") + ">"
          + "<span>💡</span><span><b>Guesser Hint</b><small>" + (hintsEligible ? coach.hintCharges + " remaining this round" : "Available from round " + coach.hintStartRound) + "</small></span></button>";
      }
      if (compassOwned) {
        html += "<button type=\"button\" class=\"cuddle-coach-action\" data-cuddle-coach-action=\"use-compass\" " + (compassUsed ? "disabled" : "") + ">"
          + "<span>🧭</span><span><b>Golden Compass</b><small>" + (compassUsed ? "Used this round" : "Find the best untested letter") + "</small></span></button>";
      }
      html += "</section>";
    }
    html += "<details class=\"cuddle-coach-stats\"><summary>Coach statistics</summary><div>"
      + "<span><b>Hints unlocked</b> " + coach.hintsPerRound + "/round</span>"
      + "<span><b>Hints used</b> " + coach.hintsUsed + "</span>"
      + "<span><b>Hint rounds</b> " + coach.hintRoundsWithUse + "</span>"
      + "<span><b>Hint start</b> Round " + coach.hintStartRound + "</span>"
      + "<span><b>Greys collected</b> " + coach.cuddleGreysCollected + "</span>"
      + "<span><b>Meter fills</b> " + coach.cuddleTriggers + "</span>"
      + "<span><b>Unused rows paid</b> " + coach.unusedRowsPaid + "</span>"
      + "<span><b>Unused-row money</b> " + formatMoney(coach.unusedRowMoney) + "</span>"
      + "</div></details></aside>";
    var next = makeElement(html);
    if (existing) existing.replaceWith(next);
    else insertAfter(board, next);
  }

  function enhanceShop(game, coach) {
    var root = document.getElementById("cuddleRoot");
    if (!root || game.state.status !== "shop") return;
    var introHeading = root.querySelector(".cuddle-shop-intro h2");
    var introText = root.querySelector(".cuddle-shop-intro p");
    if (introHeading && introHeading.textContent !== "Prepare for the next boss or improve the whole run") introHeading.textContent = "Prepare for the next boss or improve the whole run";
    var shopCopy = "Boss supplies are one-time and wait for the next boss round. Permanent upgrades apply for the rest of this run. Each item is stocked once at this stop.";
    if (introText && introText.textContent !== shopCopy) introText.textContent = shopCopy;
    var grid = root.querySelector(".cuddle-shop-grid");
    if (grid && !grid.querySelector(".cuddle-coach-shop-heading")) {
      var firstCustom = grid.querySelector('[data-shop-item-id="coachBossExtraRow"]');
      if (firstCustom) {
        var general = makeElement("<h3 class=\"cuddle-coach-shop-heading\">General one-use supplies</h3>");
        grid.insertBefore(general, grid.firstChild);
        var boss = makeElement("<h3 class=\"cuddle-coach-shop-heading is-boss\">For the next boss</h3>");
        grid.insertBefore(boss, firstCustom);
      }
      var firstPermanent = grid.querySelector('[data-shop-item-id="coachShopPossibleAnswers"]');
      if (firstPermanent) {
        var permanent = makeElement("<h3 class=\"cuddle-coach-shop-heading is-permanent\">Permanent run upgrades</h3>");
        grid.insertBefore(permanent, firstPermanent);
      }
    }
    SHOP_ITEMS.forEach(function classify(item) {
      var button = root.querySelector('[data-shop-item-id="' + item.id + '"]');
      if (button) button.classList.add("is-coach-shop-item", "is-" + item.kind);
    });
    var inventory = root.querySelector(".cuddle-shop-inventory");
    if (inventory) {
      inventory.querySelectorAll(".cuddle-coach-inventory-chip").forEach(function remove(element) { element.remove(); });
      var labels = {
        extraRow: "Boss +row",
        openingGreen: "Boss green",
        tenLetterCull: "Boss 10-cull",
        unlimitedMulligans: "Boss ∞ mulligans",
        revealThemes: "Boss themes",
        autoQuests: "Boss auto-quests",
        doubleQuestRewards: "Boss double quests",
        bossReroll: "Boss reroll"
      };
      Object.keys(labels).forEach(function badge(key) {
        var count = integer(coach.inventory[key], 0);
        if (count <= 0) return;
        inventory.insertAdjacentHTML("beforeend", "<span class=\"cuddle-shop-inventory-chip cuddle-coach-inventory-chip\">" + escapeHtml(labels[key]) + " ×" + count + "</span>");
      });
    }
  }

  function enhanceBossChoice(game, coach) {
    var root = document.getElementById("cuddleRoot");
    if (!root || game.state.status !== "bossChoice") return;
    var modal = root.querySelector(".cuddle-boss-modal");
    if (!modal) return;
    var existing = document.getElementById("cuddleCoachBossReroll");
    if (coach.inventory.bossReroll > 0 && !existing) {
      modal.insertAdjacentHTML("beforeend", "<button id=\"cuddleCoachBossReroll\" type=\"button\" class=\"cuddle-btn cuddle-btn-ghost cuddle-coach-reroll\" data-cuddle-coach-action=\"reroll-boss\">🎲 Reroll both bosses (" + coach.inventory.bossReroll + ")</button>");
    }
  }

  function enhanceStartingBonusCopy(root) {
    var overlay = root.querySelector("#cuddleMoneyStarterOverlay");
    if (!overlay) return;
    var kicker = overlay.querySelector(".cuddle-money-kicker");
    var heading = overlay.querySelector("h2");
    var paragraph = overlay.querySelector("p");
    if (kicker && kicker.textContent !== "STARTING BONUS") kicker.textContent = "STARTING BONUS";
    if (heading && heading.textContent !== "Choose your Starting Bonus!") heading.textContent = "Choose your Starting Bonus!";
    if (paragraph && paragraph.textContent !== "Choose one permanent bonus before your first Wordle.") paragraph.textContent = "Choose one permanent bonus before your first Wordle.";
  }

  function enhanceUpgradeCopy(game) {
    if (game.state.status !== "upgrade" || !isNormalRoundThreeReward(game)) return;
    var root = document.getElementById("cuddleRoot");
    var hintButton = root && root.querySelector('[data-upgrade-key="coachHint"]');
    if (hintButton && ensureCoach(game).hintsPerRound <= 0) {
      hintButton.classList.add("is-guaranteed-hint");
      var small = hintButton.querySelector("small");
      if (small && !small.textContent.includes("Guaranteed")) small.textContent += " Guaranteed in the round-3 reward offer.";
    }
  }

  function updateGoldenThread(game, coach) {
    var root = document.getElementById("cuddleRoot");
    if (!root) return;
    var board = root.querySelector(".cuddle-board");
    if (!board || !hasBossReward(game, "goldenThread") || game.state.status !== "playing") {
      if (board) board.classList.remove("is-golden-thread-live");
      lastThreadSignature = "";
      return;
    }
    var draft = typeof game.getDraftWord === "function" ? String(game.getDraftWord()).toUpperCase() : "";
    var known = new Set([].concat(game.state.knownPresent || [], (game.state.revealedPositions || []).filter(Boolean)));
    var secret = String(game.state.secret || "").toUpperCase();
    var live = draft.length === 5 && draft.split("").some(function unknownCorrect(letter) {
      return secret.includes(letter) && !known.has(letter);
    });
    board.classList.toggle("is-golden-thread-live", live);
    var signature = roundKey(game) + ":" + draft + ":" + live;
    if (live && signature !== lastThreadSignature) {
      coach.goldenThreadSignals += 1;
      try {
        if (navigator.vibrate) navigator.vibrate([28, 42, 28]);
      } catch (_) {
        // Vibration is optional and commonly unavailable on desktop.
      }
    }
    lastThreadSignature = signature;
  }

  function enhanceStatsBadges(game, coach) {
    var root = document.getElementById("cuddleRoot");
    var badges = root && root.querySelector(".cuddle-detail-badges");
    if (!badges || badges.querySelector(".cuddle-coach-detail-badge")) return;
    var fragments = [
      ["Hints", coach.hintsUsed + " used · " + coach.hintCharges + " ready"],
      ["Unused-row money", formatMoney(coach.unusedRowMoney)]
    ];
    fragments.forEach(function add(pair) {
      badges.insertAdjacentHTML("beforeend", "<span class=\"cuddle-detail-badge cuddle-coach-detail-badge\"><b>" + escapeHtml(pair[0]) + "</b> " + escapeHtml(pair[1]) + "</span>");
    });
  }

  function enhanceUi() {
    uiQueued = false;
    var root = document.getElementById("cuddleRoot");
    if (!root || !activeGame || !activeGame.state) return;
    var coach = ensureCoach(activeGame);
    enhanceStartingBonusCopy(root);
    renderCoachPanel(activeGame, coach);
    enhanceShop(activeGame, coach);
    enhanceBossChoice(activeGame, coach);
    enhanceUpgradeCopy(activeGame);
    enhanceStatsBadges(activeGame, coach);
    updateGoldenThread(activeGame, coach);
  }

  function queueUi() {
    if (uiQueued) return;
    uiQueued = true;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(enhanceUi);
    else setTimeout(enhanceUi, 0);
  }

  function installObserver() {
    var root = document.getElementById("cuddleRoot");
    if (!root || observer) {
      queueUi();
      return;
    }
    observer = new MutationObserver(queueUi);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    queueUi();
  }

  document.addEventListener("click", function handleCoachClick(event) {
    var target = event.target instanceof Element ? event.target : null;
    var button = target && target.closest("[data-cuddle-coach-action]");
    if (!button || !activeGame) return;
    event.preventDefault();
    event.stopPropagation();
    var action = button.dataset.cuddleCoachAction;
    var result;
    if (action === "use-hint") result = useHint(activeGame);
    else if (action === "use-compass") result = useGoldenCompass(activeGame);
    else if (action === "reroll-boss") result = rerollBoss(activeGame);
    else return;
    if (!result?.ok) {
      activeGame.state.lastMessage = result.error || "That action is unavailable.";
      save(activeGame);
      requestRender(activeGame);
    }
  }, true);

  window.addEventListener("cuddle:campaign-update", queueUi);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installObserver);
  else installObserver();

  window.CuddleCoachExpansion = Object.freeze({
    version: VERSION,
    upgrades: UPGRADE_DEFINITIONS.map(function clone(item) { return Object.assign({}, item); }),
    shopItems: SHOP_ITEMS.map(function clone(item) { return Object.assign({}, item); }),
    bossRewards: BOSS_REWARDS.map(function clone(item) { return Object.assign({}, item); }),
    getActiveGame: function getActiveGame() { return activeGame; },
    getPossibleAnswers: function possibleAnswers() { return activeGame ? getPossibleAnswers(activeGame).slice() : []; },
    useHint: function useCurrentHint() { return activeGame ? useHint(activeGame) : { ok: false, error: "No Cuddle run is active." }; },
    useGoldenCompass: function useCurrentCompass() { return activeGame ? useGoldenCompass(activeGame) : { ok: false, error: "No Cuddle run is active." }; },
    rerollBoss: function rerollCurrentBoss() { return activeGame ? rerollBoss(activeGame) : { ok: false, error: "No Cuddle run is active." }; },
    meterThreshold: function currentThreshold() { return activeGame ? meterThreshold(ensureCoach(activeGame)) : BASE_METER_THRESHOLD; },
    renderHeartBadge: function renderCurrentHeartBadge(game) {
      var target = game || activeGame;
      return target && target.state ? renderHeartBadge(target) : "";
    }
  });
}());
