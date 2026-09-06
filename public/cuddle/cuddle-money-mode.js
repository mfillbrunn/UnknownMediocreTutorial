/* CUDDLE_MONEY_MODE v1
 * Add-on loaded after cuddle-engine.js, cuddle-campaign.js, and cuddle-ui.js.
 * Keeps the legacy state.score field for save/shop compatibility, but treats
 * it as spendable money and removes score thresholds from round progression.
 */
(function installCuddleMoneyMode() {
  "use strict";

  var Engine = window.CuddleEngine;
  if (!Engine || !Engine.CuddleGame) {
    console.error("Cuddle Money Mode: CuddleEngine was not available.");
    return;
  }

  var Game = Engine.CuddleGame;
  var proto = Game.prototype;
  if (proto.__cuddleMoneyModeInstalled) return;
  Object.defineProperty(proto, "__cuddleMoneyModeInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  var MODE_KEY = "cuddleMoneyMode";
  var MODE_VERSION = 1;
  var activeGame = null;
  var uiObserver = null;
  var uiQueued = false;
  var payoutRunning = false;
  var runningPayoutPayload = null;
  var clockHandle = null;
  var clockKey = "";
  var clockDeadline = 0;

  // Main tuning knobs. Edit these values after applying the patch if you want
  // more/fewer offers, faster payouts, or a different reward curve.
  var CONFIG = Object.freeze({
    challengeChance: Object.freeze({ easy: 0.40, medium: 0.46, hard: 0.52 }),
    challengePityAfterMisses: 2,
    rewardPerCompletedRound: 2,
    difficultyRewardBonus: Object.freeze({ easy: 0, medium: 2, hard: 4 }),
    minimumGuessCap: 4,
    payoutRowPauseMs: 250,
    payoutBankDurationMs: 430,
    payoutCoinCount: 24
  });

  var STARTER_REWARD_IDS = [
    "doubleMulligans",
    "biggerMulligans",
    "richerColours",
    "freeVowelSweep",
    "questHead",
    "openingClue",
    "questDoublePick",
    "questCadence",
    "overtimeReward",
    "questPersistReward",
    "backupPlanReward"
  ];

  var CHALLENGES = [
    {
      id: "pocketTally",
      icon: "\uD83D\uDD22",
      title: "Pocket Tally",
      effect: "countOnly",
      turns: 2,
      baseReward: 16,
      description: "For the first two guesses, you only see the total number of green and yellow tiles, not their positions."
    },
    {
      id: "foggedSlot",
      icon: "\uD83C\uDF2B\uFE0F",
      title: "Fogged Slot",
      effect: "hideFeedback",
      turns: 2,
      baseReward: 12,
      description: "One tile position is hidden on each of your first two guesses."
    },
    {
      id: "blueHaze",
      icon: "\uD83D\uDD35",
      title: "Blue Haze",
      effect: "blueMode",
      turns: 2,
      baseReward: 14,
      description: "For two guesses, green and yellow both appear blue, so you know the letter is present but not whether it is placed correctly."
    },
    {
      id: "singleLie",
      icon: "\uD83C\uDFAD",
      title: "One Little Lie",
      effect: "singleLie",
      turns: 1,
      baseReward: 10,
      description: "Exactly one tile on your opening guess shows a false color. The other four tiles are truthful."
    },
    {
      id: "lockedOpener",
      icon: "\uD83D\uDD12",
      title: "Locked Opener",
      effect: "mulliganLock",
      turns: 1,
      baseReward: 8,
      description: "You cannot use a mulligan before submitting your first guess."
    },
    {
      id: "fiveGuessSprint",
      icon: "\uD83C\uDFC1",
      title: "Five-Guess Sprint",
      effect: "guessCap",
      turns: 0,
      baseReward: 18,
      description: "This round has one fewer guess than it normally would, with a minimum of four guesses."
    },
    {
      id: "vowelBudget",
      icon: "AEIOU",
      title: "Vowel Budget",
      effect: "vowelBudget",
      turns: 2,
      limit: 2,
      baseReward: 10,
      description: "Each of your first two guesses may contain at most two vowels."
    },
    {
      id: "cleanLetters",
      icon: "ABCDE",
      title: "Clean Letters",
      effect: "uniqueLetters",
      turns: 1,
      baseReward: 9,
      description: "Your opening guess must use five different letters."
    },
    {
      id: "quickStart",
      icon: "\u23F1\uFE0F",
      title: "Quick Start",
      effect: "clock",
      turns: 2,
      seconds: 50,
      baseReward: 15,
      description: "You have 50 seconds for each of the first two guesses. A timeout spends the guess."
    }
  ];

  function asNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function asInteger(value, fallback) {
    return Math.trunc(asNumber(value, fallback));
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function replaceCharacter(character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
      }[character];
    });
  }

  function formatMoney(value) {
    var amount = Math.round(asNumber(value, 0));
    var sign = amount < 0 ? "-" : "";
    return sign + "$" + Math.abs(amount).toLocaleString();
  }

  function formatDelta(value) {
    var amount = Math.round(asNumber(value, 0));
    if (amount > 0) return "+$" + amount.toLocaleString();
    if (amount < 0) return "-$" + Math.abs(amount).toLocaleString();
    return "+$0";
  }

  function randomFor(game) {
    try {
      if (game && typeof game.random === "function") return game.random();
    } catch (error) {
      console.warn("Cuddle Money Mode: seeded random failed; using Math.random.", error);
    }
    return Math.random();
  }

  function shuffled(items, game) {
    var copy = items.slice();
    for (var index = copy.length - 1; index > 0; index -= 1) {
      var target = Math.floor(randomFor(game) * (index + 1));
      var temporary = copy[index];
      copy[index] = copy[target];
      copy[target] = temporary;
    }
    return copy;
  }

  function defaultModeState(existingRun) {
    return {
      version: MODE_VERSION,
      starterRewardPending: false,
      starterRewardClaimed: Boolean(existingRun),
      starterRewardChoices: [],
      starterRewardId: null,
      challengeOffer: null,
      activeChallenge: null,
      lastRoundKey: null,
      noOfferStreak: 0,
      recentChallengeIds: [],
      acceptedChallenges: 0,
      declinedChallenges: 0,
      completedChallenges: 0,
      failedChallenges: 0,
      roundStartingMoney: 0,
      pendingPayout: null,
      lastAnimatedPayoutId: null
    };
  }

  function migrateFirstBossGate(state) {
    if (!state) return;
    if (Array.isArray(state.bossGatesDone)) {
      state.bossGatesDone = state.bossGatesDone.map(function renameGate(gate) {
        return gate === "before-4" ? "before-3" : gate;
      });
      state.bossGatesDone = state.bossGatesDone.filter(function uniqueGate(gate, index, gates) {
        return gates.indexOf(gate) === index;
      });
    }
    if (Array.isArray(state.bossOffer)) {
      state.bossOffer = state.bossOffer.map(function renameOffer(option) {
        return option && option.gate === "before-4" ? Object.assign({}, option, { gate: "before-3" }) : option;
      });
    }
    if (state.boss && state.boss.gate === "before-4") state.boss.gate = "before-3";
    if (state.lastClearedBossGate === "before-4") state.lastClearedBossGate = "before-3";
  }

  function ensureMode(game) {
    if (!game || !game.state) return null;
    var state = game.state;
    var mode = state[MODE_KEY];
    if (!mode || typeof mode !== "object") {
      mode = defaultModeState(true);
      state[MODE_KEY] = mode;
    }
    var defaults = defaultModeState(true);
    Object.keys(defaults).forEach(function fillDefault(key) {
      if (!(key in mode)) mode[key] = defaults[key];
    });
    mode.version = MODE_VERSION;
    mode.starterRewardPending = Boolean(mode.starterRewardPending);
    mode.starterRewardClaimed = Boolean(mode.starterRewardClaimed);
    mode.starterRewardChoices = Array.isArray(mode.starterRewardChoices) ? mode.starterRewardChoices : [];
    mode.recentChallengeIds = Array.isArray(mode.recentChallengeIds) ? mode.recentChallengeIds.slice(-3) : [];
    mode.noOfferStreak = Math.max(0, asInteger(mode.noOfferStreak, 0));
    mode.acceptedChallenges = Math.max(0, asInteger(mode.acceptedChallenges, 0));
    mode.declinedChallenges = Math.max(0, asInteger(mode.declinedChallenges, 0));
    mode.completedChallenges = Math.max(0, asInteger(mode.completedChallenges, 0));
    mode.failedChallenges = Math.max(0, asInteger(mode.failedChallenges, 0));
    migrateFirstBossGate(state);
    return mode;
  }

  function starterRewardChoices(game) {
    var questBook = window.CuddleQuestBook;
    var choices = STARTER_REWARD_IDS.map(function rewardForId(id) {
      return questBook && typeof questBook.getBossReward === "function" ? questBook.getBossReward(id) : null;
    }).filter(Boolean);
    return shuffled(choices, game).slice(0, 3);
  }

  function resetModeForNewRun(game) {
    var state = game.state;
    var mode = defaultModeState(false);
    mode.starterRewardPending = true;
    mode.starterRewardClaimed = false;
    mode.starterRewardChoices = starterRewardChoices(game);
    mode.roundStartingMoney = asNumber(state.score, 0) - asNumber(state.roundScore, 0);
    mode.lastRoundKey = [state.runId, state.round, state.secret].join(":");
    state[MODE_KEY] = mode;
    migrateFirstBossGate(state);
    return mode;
  }

  function challengeReward(game, definition) {
    var round = Math.max(1, asInteger(game.state && game.state.round, 1));
    var difficulty = String(game.state && game.state.megaState && game.state.megaState.difficulty || "hard");
    var difficultyBonus = asInteger(CONFIG.difficultyRewardBonus[difficulty], CONFIG.difficultyRewardBonus.hard);
    return Math.max(1, asInteger(definition.baseReward, 8)
      + Math.max(0, round - 1) * CONFIG.rewardPerCompletedRound
      + difficultyBonus);
  }

  function maybeOfferChallenge(game, mode) {
    var state = game.state;
    if (!state || game.isBossRound() || state.round < 2 || state.status !== "playing") return;
    var roundKey = [state.runId, state.round, state.secret].join(":");
    if (mode.lastRoundKey === roundKey) return;
    mode.lastRoundKey = roundKey;
    mode.challengeOffer = null;
    mode.activeChallenge = null;
    mode.roundStartingMoney = asNumber(state.score, 0) - asNumber(state.roundScore, 0);

    var difficulty = String(state.megaState && state.megaState.difficulty || "hard");
    var chance = asNumber(CONFIG.challengeChance[difficulty], CONFIG.challengeChance.hard);
    var shouldOffer = mode.noOfferStreak >= CONFIG.challengePityAfterMisses || randomFor(game) < chance;
    if (!shouldOffer) {
      mode.noOfferStreak += 1;
      return;
    }

    mode.noOfferStreak = 0;
    var recent = new Set(mode.recentChallengeIds || []);
    var pool = CHALLENGES.filter(function notRecent(challenge) {
      return !recent.has(challenge.id);
    });
    if (!pool.length) pool = CHALLENGES.slice();
    var definition = pool[Math.floor(randomFor(game) * pool.length)] || CHALLENGES[0];
    var offer = Object.assign({}, definition, {
      reward: challengeReward(game, definition),
      offeredRound: state.round,
      hiddenIndex: Math.floor(randomFor(game) * 5),
      fakeIndex: Math.floor(randomFor(game) * 5)
    });
    mode.challengeOffer = offer;
    mode.recentChallengeIds = mode.recentChallengeIds.concat(offer.id).slice(-3);
  }

  function activateGame(game) {
    if (!game || !game.state) return;
    activeGame = game;
    ensureMode(game);
    queueUiEnhancement();
  }

  function saveGame(game) {
    try {
      if (game && typeof game.save === "function") game.save();
    } catch (error) {
      console.warn("Cuddle Money Mode: save failed.", error);
    }
  }

  function requestRender(game) {
    queueUiEnhancement();
    try {
      window.dispatchEvent(new CustomEvent("cuddle:campaign-update", {
        detail: { runId: game && game.state ? game.state.runId : null }
      }));
    } catch (error) {
      console.warn("Cuddle Money Mode: UI update event failed.", error);
    }
  }

  function acceptChallenge(game) {
    var mode = ensureMode(game);
    if (!mode || !mode.challengeOffer || mode.activeChallenge) {
      return { ok: false, error: "No mini challenge is waiting." };
    }
    var challenge = Object.assign({}, mode.challengeOffer, { accepted: true });
    mode.challengeOffer = null;
    mode.activeChallenge = challenge;
    mode.acceptedChallenges += 1;
    if (challenge.effect === "guessCap") {
      game.state.maxGuesses = Math.max(CONFIG.minimumGuessCap, asInteger(game.state.maxGuesses, 6) - 1);
    }
    game.state.lastMessage = challenge.title + " accepted. Solve the Wordle to collect " + formatMoney(challenge.reward) + ".";
    saveGame(game);
    requestRender(game);
    return { ok: true };
  }

  function declineChallenge(game) {
    var mode = ensureMode(game);
    if (!mode || !mode.challengeOffer) {
      return { ok: false, error: "No mini challenge is waiting." };
    }
    var title = mode.challengeOffer.title;
    mode.challengeOffer = null;
    mode.declinedChallenges += 1;
    game.state.lastMessage = title + " declined. The round uses its normal rules.";
    saveGame(game);
    requestRender(game);
    return { ok: true };
  }

  function applyStarterRewardNow(game, rewardId) {
    var state = game.state;
    var beforeAllowance = typeof game.getMulliganAllowance === "function"
      ? asInteger(game.getMulliganAllowance(), asInteger(state.mulligansLeft, 0))
      : asInteger(state.mulligansLeft, 0);
    var message = typeof game._applyBossReward === "function" ? game._applyBossReward(rewardId) : "";

    if (rewardId === "doubleMulligans" && typeof game.getMulliganAllowance === "function") {
      var afterAllowance = asInteger(game.getMulliganAllowance(), beforeAllowance);
      state.mulligansLeft = asInteger(state.mulligansLeft, 0) + Math.max(0, afterAllowance - beforeAllowance);
    }
    if (rewardId === "overtimeReward") {
      state.maxGuesses = Math.max(1, asInteger(state.maxGuesses, 6) + 1);
    }
    if (rewardId === "openingClue" && typeof game._applyRewardEffect === "function") {
      var clueMessage = game._applyRewardEffect("revealLocation");
      if (clueMessage) message = (message + " " + clueMessage).trim();
    }
    if (rewardId === "freeVowelSweep" && typeof game._applyFreeVowelSweep === "function") {
      var sweepMessage = game._applyFreeVowelSweep();
      if (sweepMessage) message = (message + " " + sweepMessage).trim();
    }
    return message;
  }

  proto.chooseCuddleStarterReward = function chooseCuddleStarterReward(rewardId) {
    activateGame(this);
    var mode = ensureMode(this);
    var reward = mode && mode.starterRewardChoices.find(function matchingReward(choice) {
      return choice && choice.id === rewardId;
    });
    if (!mode || !mode.starterRewardPending || !reward) {
      return { ok: false, error: "That Starting Bonus is not available." };
    }

    var message = applyStarterRewardNow(this, reward.id);
    mode.starterRewardPending = false;
    mode.starterRewardClaimed = true;
    mode.starterRewardId = reward.id;
    mode.starterRewardChoices = [];
    this.state.lastMessage = "Starting Bonus: " + reward.title + ". " + (message || reward.description);
    this.state.bossRewardNotice = {
      icon: reward.icon || "\uD83C\uDF81",
      title: reward.title,
      message: message || reward.description,
      bossTitle: "Starting Bonus"
    };
    if (Array.isArray(this.state.rewardBookHistory)) {
      this.state.rewardBookHistory.push({
        id: reward.id,
        icon: reward.icon || "\uD83C\uDF81",
        title: reward.title,
        description: reward.description || "",
        kind: "starter",
        round: 1
      });
      this.state.rewardBookHistory = this.state.rewardBookHistory.slice(-40);
    }
    saveGame(this);
    requestRender(this);
    return { ok: true, reward: reward };
  };

  var originalHydrate = proto._hydrateState;
  proto._hydrateState = function hydrateCuddleMoneyMode() {
    var result = typeof originalHydrate === "function" ? originalHydrate.apply(this, arguments) : undefined;
    ensureMode(this);
    activateGame(this);
    return result;
  };

  var originalLoad = Game.load;
  if (typeof originalLoad === "function") {
    Game.load = function loadCuddleMoneyMode() {
      var game = originalLoad.apply(this, arguments);
      if (game) activateGame(game);
      return game;
    };
  }

  var originalStartNew = proto.startNew;
  proto.startNew = function startNewCuddleMoneyMode() {
    var result = originalStartNew.apply(this, arguments);
    resetModeForNewRun(this);
    activateGame(this);
    saveGame(this);
    return typeof this.getSnapshot === "function" ? this.getSnapshot() : result;
  };

  var originalBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundCuddleMoneyMode() {
    var result = originalBeginRound.apply(this, arguments);
    var mode = ensureMode(this);
    activateGame(this);
    if (!mode) return result;
    mode.roundStartingMoney = asNumber(this.state.score, 0) - asNumber(this.state.roundScore, 0);
    if (this.isBossRound()) {
      mode.challengeOffer = null;
      mode.activeChallenge = null;
    } else {
      maybeOfferChallenge(this, mode);
      var message = String(this.state.lastMessage || "");
      if (/reach\s+-?\d+\s+total\s+points/i.test(message)) {
        this.state.lastMessage = "Round " + this.state.round + ": solve the fixed secret to continue. Every useful tile and bonus earns money.";
      }
    }
    return result;
  };

  // The old target remains useful only as a twelve-round campaign length.
  // Returning zero keeps old UI/API callers harmless; the resolver below
  // bypasses the comparison entirely, including when the bank is negative.
  proto.getTarget = function getCuddleMoneyTarget() {
    return 0;
  };

  var originalResolvePendingRoundEnd = proto._resolvePendingRoundEnd;
  proto._resolvePendingRoundEnd = function resolveCuddleMoneyRoundEnd() {
    var pending = this.state && this.state.pendingRoundEnd;
    var normalSolved = Boolean(pending && pending.type === "solved" && !this.isBossRound());
    var mode = ensureMode(this);
    var result;
    if (normalSolved) {
      var hadOwnTarget = Object.prototype.hasOwnProperty.call(this, "getTarget");
      var previousTarget = this.getTarget;
      this.getTarget = function noThresholdTarget() { return Number.NEGATIVE_INFINITY; };
      try {
        result = originalResolvePendingRoundEnd.apply(this, arguments);
      } finally {
        if (hadOwnTarget) this.getTarget = previousTarget;
        else delete this.getTarget;
      }
      if (this.state.lastRoundSummary) {
        this.state.lastRoundSummary.target = null;
        this.state.lastRoundSummary.score = this.state.score;
        this.state.lastRoundSummary.roundScore = this.state.roundScore;
      }
    } else {
      result = originalResolvePendingRoundEnd.apply(this, arguments);
    }
    return result;
  };

  proto._bossGateFor = function bossGateForCuddleMoneyMode(round) {
    var value = asInteger(round, 1);
    if (value === 3 || value === 7 || value === 10) return "before-" + value;
    var roundCount = Engine.THRESHOLDS && Engine.THRESHOLDS.length ? Engine.THRESHOLDS.length : 12;
    if (value > roundCount) return "final";
    return null;
  };

  var originalApplyBossFeedback = proto._applyBossFeedback;
  proto._applyBossFeedback = function applyMiniChallengeFeedback(word, feedback) {
    var mode = ensureMode(this);
    var challenge = mode && mode.activeChallenge;
    if (!challenge || this.state.boss || asInteger(this.state.guessesUsed, 0) >= asInteger(challenge.turns, 0)) {
      return originalApplyBossFeedback.apply(this, arguments);
    }

    if (challenge.effect === "countOnly" || challenge.effect === "hideFeedback" || challenge.effect === "blueMode") {
      var savedBoss = this.state.boss;
      this.state.boss = {
        id: challenge.effect,
        title: challenge.title,
        turns: challenge.turns,
        hiddenIndex: challenge.hiddenIndex
      };
      try {
        return originalApplyBossFeedback.apply(this, arguments);
      } finally {
        this.state.boss = savedBoss;
      }
    }

    var result = originalApplyBossFeedback.apply(this, arguments);
    if (challenge.effect !== "singleLie" || asInteger(this.state.guessesUsed, 0) >= 1) return result;
    var shown = Array.isArray(result.shown) ? result.shown.slice() : feedback.slice();
    var learn = Array.isArray(result.learn) ? result.learn.slice() : feedback.slice();
    var index = clamp(asInteger(challenge.fakeIndex, 0), 0, Math.max(0, shown.length - 1));
    var truth = feedback[index];
    var alternatives = ["green", "yellow", "grey"].filter(function wrongColor(color) {
      return color !== truth;
    });
    shown[index] = alternatives[Math.floor(randomFor(this) * alternatives.length)] || "unknown";
    learn[index] = "unknown";
    return Object.assign({}, result, { shown: shown, learn: learn, fake: true });
  };

  function challengeValidationError(game, challenge) {
    if (!challenge) return "";
    var guessIndex = asInteger(game.state.guessesUsed, 0);
    if (guessIndex >= asInteger(challenge.turns, 0)) return "";
    var word = String(typeof game.getDraftWord === "function" ? game.getDraftWord() : "").toUpperCase();
    if (word.length !== 5) return "";
    if (challenge.effect === "vowelBudget") {
      var vowelCount = word.split("").filter(function isVowel(letter) {
        return "AEIOU".indexOf(letter) >= 0;
      }).length;
      if (vowelCount > asInteger(challenge.limit, 2)) {
        return challenge.title + ": use at most " + challenge.limit + " vowels on this guess.";
      }
    }
    if (challenge.effect === "uniqueLetters" && new Set(word.split("")).size !== 5) {
      return challenge.title + ": the opening guess must use five different letters.";
    }
    return "";
  }

  function rowMoney(entry) {
    if (!entry) return 0;
    return asNumber(entry.scoreDelta, 0)
      + asNumber(entry.questBonus, 0)
      + asNumber(entry.earlyBonus, 0)
      + asNumber(entry.mulliganBonus, 0)
      + asNumber(entry.cuddleQuestBonus, 0)
      + asNumber(entry.cuddleSolveBonus, 0)
      + asNumber(entry.challengeBonus, 0)
      - asNumber(entry.questTrialPenalty, 0)
      - asNumber(entry.ratchetQuestPenalty, 0);
  }

  function buildPayout(game, challenge) {
    var state = game.state;
    var mode = ensureMode(game);
    var start = asNumber(mode.roundStartingMoney, asNumber(state.score, 0) - asNumber(state.roundScore, 0));
    var finish = asNumber(state.score, 0);
    var rows = (Array.isArray(state.history) ? state.history : []).map(function payoutRow(entry, index) {
      return {
        index: index,
        word: String(entry && entry.word || "").toUpperCase(),
        feedback: (entry && (entry.shownFeedback || entry.feedback) || []).slice(),
        timedOut: Boolean(entry && entry.timedOut),
        amount: Math.round(rowMoney(entry))
      };
    });
    if (!rows.length) return null;
    var expected = Math.round(finish - start);
    var allocated = rows.reduce(function sumRows(total, row) { return total + row.amount; }, 0);
    rows[rows.length - 1].amount += expected - allocated;
    return {
      id: [state.runId, state.round, Date.now(), Math.floor(randomFor(game) * 1000000)].join("-"),
      round: state.round,
      from: Math.round(start),
      to: Math.round(finish),
      total: expected,
      rows: rows,
      challenge: challenge ? {
        title: challenge.title,
        icon: challenge.icon,
        reward: challenge.reward
      } : null
    };
  }

  var originalSubmitDraft = proto.submitDraft;
  proto.submitDraft = function submitCuddleMoneyDraft() {
    activateGame(this);
    var state = this.state;
    var mode = ensureMode(this);
    var wasBoss = this.isBossRound();
    var challenge = !wasBoss && mode ? mode.activeChallenge : null;
    var restrictionError = challengeValidationError(this, challenge);
    if (restrictionError) return { ok: false, error: restrictionError };

    var result = originalSubmitDraft.apply(this, arguments);
    if (!result || !result.ok) return result;
    var entry = state.history && state.history[state.history.length - 1];

    if (result.solved && !wasBoss) {
      if (challenge) {
        var reward = Math.max(0, asInteger(challenge.reward, 0));
        state.score = asNumber(state.score, 0) + reward;
        state.roundScore = asNumber(state.roundScore, 0) + reward;
        if (entry) entry.challengeBonus = reward;
        if (state.pendingRoundEnd) state.pendingRoundEnd.score = state.score;
        if (state.lastRoundSummary) {
          state.lastRoundSummary.score = state.score;
          state.lastRoundSummary.roundScore = state.roundScore;
          state.lastRoundSummary.challenge = challenge.title;
          state.lastRoundSummary.challengeBonus = reward;
        }
        mode.completedChallenges += 1;
        state.lastMessage = (state.lastMessage || "") + " Mini challenge cleared: " + challenge.title + " " + formatDelta(reward) + ".";
      }
      mode.pendingPayout = buildPayout(this, challenge);
      mode.activeChallenge = null;
    } else if (state.status === "lost" && challenge) {
      mode.failedChallenges += 1;
      mode.activeChallenge = null;
    }

    saveGame(this);
    queueUiEnhancement();
    return result;
  };

  var originalMulligan = proto.mulligan;
  proto.mulligan = function mulliganCuddleMoneyMode() {
    activateGame(this);
    var mode = ensureMode(this);
    var challenge = mode && mode.activeChallenge;
    if (challenge && challenge.effect === "mulliganLock" && asInteger(this.state.guessesUsed, 0) < 1) {
      return { ok: false, error: challenge.title + ": submit the opening guess before using a mulligan." };
    }
    return originalMulligan.apply(this, arguments);
  };

  var originalForfeitGuess = proto.forfeitGuess;
  proto.forfeitGuess = function forfeitCuddleMoneyGuess() {
    activateGame(this);
    var result = originalForfeitGuess.apply(this, arguments);
    var mode = ensureMode(this);
    if (result && result.ok && this.state.status === "lost" && mode && mode.activeChallenge) {
      mode.failedChallenges += 1;
      mode.activeChallenge = null;
      saveGame(this);
    }
    return result;
  };

  function replaceVisibleMoneyCopy(root, game) {
    var state = game.state;
    root.querySelectorAll(".cuddle-header-score").forEach(function updateHeader(element) {
      var text = formatMoney(state.score);
      if (element.textContent !== text) element.textContent = text;
      element.setAttribute("aria-label", "Spendable money " + formatMoney(state.score));
    });

    root.querySelectorAll(".cuddle-progress-node").forEach(function updateProgressNode(element) {
      var round = element.textContent.trim();
      element.title = "Round " + round + ": solve the Wordle";
    });

    var stats = root.querySelector(".cuddle-round-intro-stats");
    if (stats) {
      var blocks = stats.children;
      if (blocks[0]) {
        var label = blocks[0].querySelector("span");
        var value = blocks[0].querySelector("strong");
        if (label) label.textContent = "Current money";
        if (value) value.textContent = formatMoney(state.score);
      }
      for (var index = 1; index < blocks.length; index += 1) blocks[index].hidden = true;
    }

    var mapStats = root.querySelector("#cuddleMapStatsPanel > p");
    if (mapStats) mapStats.textContent = "Solve the fixed secret to clear the round. Money is for upgrades, shops, and bragging rights -- never a pass/fail threshold.";

    var shopHeading = root.querySelector(".cuddle-shop-intro h2");
    if (shopHeading) shopHeading.textContent = "Spend money on one-use supplies";
    var shopCopy = root.querySelector(".cuddle-shop-intro p");
    if (shopCopy) shopCopy.textContent = "Money is your spendable run currency. Purchases lower your wallet, but never block round progression.";
    var shopWalletValue = root.querySelector(".cuddle-shop-wallet strong");
    if (shopWalletValue) shopWalletValue.textContent = formatMoney(state.score);
    var shopWalletUnit = root.querySelector(".cuddle-shop-wallet small");
    if (shopWalletUnit) shopWalletUnit.textContent = "money";
    root.querySelectorAll(".cuddle-shop-item-cost").forEach(function updateShopCost(element) {
      var text = element.textContent.trim();
      var number = text.match(/\d+/);
      if (!number) return;
      if (/^Need/i.test(text)) element.textContent = "Need $" + number[0];
      else if (!/^Sold/i.test(text)) element.textContent = "$" + number[0];
    });

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    var node;
    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.forEach(function rewriteNode(textNode) {
      var parent = textNode.parentElement;
      if (!parent || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(parent.tagName)) return;
      var original = textNode.nodeValue;
      var next = original
        .replace(/\bScore\b/g, "Money")
        .replace(/\bscore\b/g, "money")
        .replace(/\bPoints\b/g, "Money")
        .replace(/\bpoints\b/g, "money")
        .replace(/\bpoint\b/g, "dollar")
        .replace(/\breach 0 total money and solve the fixed secret\b/gi, "solve the fixed secret")
        .replace(/\bat or above the next money target\b/gi, "by solving the Wordle")
        .replace(/\bnext money target\b/gi, "next round");
      if (next !== original) textNode.nodeValue = next;
    });
  }

  function removeElement(id) {
    var element = document.getElementById(id);
    if (element) element.remove();
  }

  function starterRewardModal(game, mode) {
    if (!mode.starterRewardPending || !mode.starterRewardChoices.length) {
      removeElement("cuddleMoneyStarterOverlay");
      return;
    }
    var root = document.getElementById("cuddleRoot");
    if (!root || !root.querySelector(".cuddle-header")) return;
    if (document.getElementById("cuddleMoneyStarterOverlay")) return;
    var cards = mode.starterRewardChoices.map(function rewardCard(reward) {
      return "<button type=\"button\" class=\"cuddle-money-choice\" data-cuddle-money-action=\"starter\" data-reward-id=\"" + escapeHtml(reward.id) + "\">"
        + "<span class=\"cuddle-money-choice-icon\">" + escapeHtml(reward.icon || "\uD83C\uDF81") + "</span>"
        + "<span><strong>" + escapeHtml(reward.title) + "</strong><small>" + escapeHtml(reward.description) + "</small></span>"
        + "<b>FREE</b></button>";
    }).join("");
    root.insertAdjacentHTML("beforeend",
      "<div id=\"cuddleMoneyStarterOverlay\" class=\"cuddle-money-overlay\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"cuddleMoneyStarterTitle\">"
      + "<section class=\"cuddle-money-modal\"><span class=\"cuddle-money-kicker\">STARTING BONUS</span>"
      + "<h2 id=\"cuddleMoneyStarterTitle\">Choose your Starting Bonus!</h2>"
      + "<p>Choose one permanent bonus before your first Wordle.</p>"
      + "<div class=\"cuddle-money-choice-grid\">" + cards + "</div></section></div>"
    );
  }

  function challengeOfferModal(game, mode) {
    if (!mode.challengeOffer || mode.starterRewardPending) {
      removeElement("cuddleMoneyChallengeOverlay");
      return;
    }
    var root = document.getElementById("cuddleRoot");
    if (!root || !root.querySelector(".cuddle-header")) return;
    var existing = document.getElementById("cuddleMoneyChallengeOverlay");
    if (existing) return;
    var challenge = mode.challengeOffer;
    root.insertAdjacentHTML("beforeend",
      "<div id=\"cuddleMoneyChallengeOverlay\" class=\"cuddle-money-overlay\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"cuddleMoneyChallengeTitle\">"
      + "<section class=\"cuddle-money-modal cuddle-money-challenge-offer\">"
      + "<span class=\"cuddle-money-kicker\">OPTIONAL MINI BOSS</span>"
      + "<div class=\"cuddle-money-offer-icon\">" + escapeHtml(challenge.icon) + "</div>"
      + "<h2 id=\"cuddleMoneyChallengeTitle\">" + escapeHtml(challenge.title) + "</h2>"
      + "<p>" + escapeHtml(challenge.description) + "</p>"
      + "<div class=\"cuddle-money-reward-chip\">Solve it: " + formatDelta(challenge.reward) + "</div>"
      + "<div class=\"cuddle-money-modal-actions\">"
      + "<button type=\"button\" class=\"cuddle-btn\" data-cuddle-money-action=\"decline-challenge\">No thanks</button>"
      + "<button type=\"button\" class=\"cuddle-btn cuddle-btn-primary\" data-cuddle-money-action=\"accept-challenge\">Accept challenge</button>"
      + "</div></section></div>"
    );
  }

  // Pure markup, no DOM writes -- rendered declaratively as part of the
  // normal Cuddle play-screen template now (see cuddle-campaign.js's
  // insertMap, which splices this into the top of .cuddle-left-column,
  // same place as the boss/quest cards). It used to be patched into the
  // DOM after the fact via insertAdjacentHTML on every render tick, which
  // meant the base engine's full innerHTML re-render (on every guess) wiped
  // it out and this recreated it from scratch each time -- replaying the
  // entrance animation and briefly bumping the header's own height on
  // every single guess, which is what made it feel like the page kept
  // jumping back to the top. Keeping the same ids/classes so
  // syncChallengeClock's getElementById lookups keep working unchanged.
  function activeChallengeBannerMarkup(game, mode) {
    var challenge = mode.activeChallenge;
    if (!challenge || game.isBossRound()) return "";
    return (
      "<section id=\"cuddleMoneyChallengeBanner\" class=\"cuddle-money-challenge-banner\" aria-live=\"polite\">"
      + "<span class=\"cuddle-money-challenge-icon\">" + escapeHtml(challenge.icon || "!") + "</span>"
      + "<span class=\"cuddle-money-challenge-copy\"><small>MINI CHALLENGE ACTIVE</small><strong>" + escapeHtml(challenge.title || "") + "</strong><em>" + escapeHtml(challenge.description || "") + "</em></span>"
      + "<span class=\"cuddle-money-challenge-value\">" + formatDelta(challenge.reward) + "</span>"
      + "<span id=\"cuddleMoneyClock\" class=\"cuddle-money-clock\" hidden></span>"
      + "</section>"
    );
  }

  function tileMarkup(letter, result) {
    var safeResult = ["green", "yellow", "grey", "blue", "unknown"].indexOf(result) >= 0 ? result : "";
    return "<span class=\"cuddle-money-payout-tile" + (safeResult ? " is-" + safeResult : "") + "\">" + escapeHtml(letter || "") + "</span>";
  }

  function payoutRowMarkup(row) {
    var word = row.timedOut ? "TIME!" : (row.word || "     ").padEnd(5, " ").slice(0, 5);
    var tiles = word.split("").map(function payoutTile(letter, index) {
      return tileMarkup(letter === " " ? "" : letter, row.feedback[index] || "");
    }).join("");
    return "<div class=\"cuddle-money-payout-row\" data-payout-row=\"" + row.index + "\">"
      + "<div class=\"cuddle-money-payout-tiles\">" + tiles + "</div>"
      + "<span class=\"cuddle-money-row-increment\">" + formatDelta(row.amount) + "</span></div>";
  }

  function animateBank(element, from, to, duration) {
    return new Promise(function animatePromise(resolve) {
      if (!element || duration <= 0) {
        if (element) element.textContent = formatMoney(to);
        resolve();
        return;
      }
      var startTime = performance.now();
      function frame(now) {
        var progress = clamp((now - startTime) / duration, 0, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = formatMoney(Math.round(from + (to - from) * eased));
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function delay(milliseconds) {
    return new Promise(function delayPromise(resolve) { setTimeout(resolve, milliseconds); });
  }

  async function runPayoutAnimation(payload, overlay) {
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var rowPause = reduceMotion ? 20 : CONFIG.payoutRowPauseMs;
    var bankDuration = reduceMotion ? 0 : CONFIG.payoutBankDurationMs;
    var bank = overlay.querySelector("#cuddleMoneyBankCounter");
    var current = payload.from;
    var rows = Array.from(overlay.querySelectorAll(".cuddle-money-payout-row"));
    for (var index = 0; index < rows.length; index += 1) {
      var rowElement = rows[index];
      var row = payload.rows[index];
      rowElement.classList.add("is-counting");
      var increment = rowElement.querySelector(".cuddle-money-row-increment");
      if (increment) increment.classList.add("is-visible");
      await animateBank(bank, current, current + row.amount, bankDuration);
      current += row.amount;
      rowElement.classList.remove("is-counting");
      rowElement.classList.add("is-settled");
      await delay(rowPause);
    }
    if (bank) bank.textContent = formatMoney(payload.to);
    var total = overlay.querySelector(".cuddle-money-payout-total");
    var collect = overlay.querySelector("[data-cuddle-money-action=\"collect-payout\"]");
    if (total) total.classList.add("is-visible");
    overlay.classList.add("is-finished");
    if (collect) {
      collect.hidden = false;
      collect.focus({ preventScroll: true });
    }
  }

  function startPendingPayout(game, mode) {
    if (payoutRunning || !mode.pendingPayout) return;
    var root = document.getElementById("cuddleRoot");
    if (!root || !root.querySelector(".cuddle-header")) return;
    var payload = mode.pendingPayout;
    if (!payload || payload.id === mode.lastAnimatedPayoutId) {
      mode.pendingPayout = null;
      return;
    }
    payoutRunning = true;
    runningPayoutPayload = payload;
    mode.pendingPayout = null;
    mode.lastAnimatedPayoutId = payload.id;
    saveGame(game);

    var confetti = "";
    for (var index = 0; index < CONFIG.payoutCoinCount; index += 1) {
      confetti += "<i style=\"--coin-x:" + (5 + (index * 37) % 90) + "%;--coin-delay:" + ((index % 8) * 0.08) + "s;--coin-spin:" + (index % 2 ? 1 : -1) + "\"></i>";
    }
    var challengeLine = payload.challenge
      ? "<p class=\"cuddle-money-payout-challenge\">" + escapeHtml(payload.challenge.icon) + " " + escapeHtml(payload.challenge.title) + " cleared: " + formatDelta(payload.challenge.reward) + "</p>"
      : "";
    root.insertAdjacentHTML("beforeend",
      "<div id=\"cuddleMoneyPayoutOverlay\" class=\"cuddle-money-overlay cuddle-money-payout-overlay\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"cuddleMoneyPayoutTitle\">"
      + "<div class=\"cuddle-money-confetti\" aria-hidden=\"true\">" + confetti + "</div>"
      + "<section class=\"cuddle-money-payout-card\">"
      + "<span class=\"cuddle-money-kicker\">ROUND " + escapeHtml(payload.round) + " CASH OUT</span>"
      + "<h2 id=\"cuddleMoneyPayoutTitle\">Every row pays</h2>"
      + challengeLine
      + "<div class=\"cuddle-money-bank\"><span>Wallet</span><strong id=\"cuddleMoneyBankCounter\">" + formatMoney(payload.from) + "</strong></div>"
      + "<div class=\"cuddle-money-payout-rows\">" + payload.rows.map(payoutRowMarkup).join("") + "</div>"
      + "<div class=\"cuddle-money-payout-total\"><span>ROUND TOTAL</span><strong>" + formatDelta(payload.total) + "</strong></div>"
      + "<button type=\"button\" class=\"cuddle-btn cuddle-btn-primary cuddle-money-collect\" data-cuddle-money-action=\"collect-payout\" hidden>Collect " + formatMoney(payload.to) + "</button>"
      + "</section></div>"
    );
    var overlay = document.getElementById("cuddleMoneyPayoutOverlay");
    if (overlay) runPayoutAnimation(payload, overlay).catch(function payoutError(error) {
      console.error("Cuddle Money Mode: payout animation failed.", error);
      var collect = overlay.querySelector("[data-cuddle-money-action=\"collect-payout\"]");
      if (collect) collect.hidden = false;
    });
  }

  function clearChallengeClock() {
    if (clockHandle) clearInterval(clockHandle);
    clockHandle = null;
    clockKey = "";
    clockDeadline = 0;
    var clock = document.getElementById("cuddleMoneyClock");
    if (clock) clock.hidden = true;
  }

  function syncChallengeClock(game, mode) {
    var state = game.state;
    var challenge = mode.activeChallenge;
    var running = Boolean(
      challenge
      && challenge.effect === "clock"
      && state.status === "playing"
      && !state.roundIntroPending
      && !state.pendingRoundEnd
      && asInteger(state.guessesUsed, 0) < asInteger(challenge.turns, 0)
      && !game.isBossRound()
    );
    if (!running) {
      clearChallengeClock();
      return;
    }
    var key = [state.runId, state.round, state.guessesUsed].join(":");
    var seconds = Math.max(10, asInteger(challenge.seconds, 50));
    if (clockKey !== key) {
      clearChallengeClock();
      clockKey = key;
      clockDeadline = Date.now() + seconds * 1000;
    }
    var clock = document.getElementById("cuddleMoneyClock");
    if (clock) clock.hidden = false;

    function tick() {
      var remaining = Math.max(0, clockDeadline - Date.now());
      var display = document.getElementById("cuddleMoneyClock");
      if (display) {
        display.hidden = false;
        display.textContent = (remaining / 1000).toFixed(1) + "s";
        display.style.setProperty("--clock-progress", String(remaining / (seconds * 1000)));
      }
      if (remaining > 0) return;
      clearChallengeClock();
      var result = game.forfeitGuess();
      if (result && result.ok) {
        saveGame(game);
        requestRender(game);
      }
    }

    if (!clockHandle) clockHandle = setInterval(tick, 100);
    tick();
  }

  function enhanceUi() {
    uiQueued = false;
    var root = document.getElementById("cuddleRoot");
    if (!root || !activeGame || !activeGame.state) return;
    var mode = ensureMode(activeGame);
    // The campaign can re-render the whole Cuddle root when an asynchronous
    // category hint arrives. If that happens during cash-out, replay the
    // animation instead of leaving later payouts permanently blocked.
    if (payoutRunning && !document.getElementById("cuddleMoneyPayoutOverlay")) {
      payoutRunning = false;
      if (runningPayoutPayload) {
        mode.pendingPayout = runningPayoutPayload;
        mode.lastAnimatedPayoutId = null;
      }
      runningPayoutPayload = null;
    }
    replaceVisibleMoneyCopy(root, activeGame);
    starterRewardModal(activeGame, mode);
    challengeOfferModal(activeGame, mode);
    startPendingPayout(activeGame, mode);
    syncChallengeClock(activeGame, mode);
  }

  function queueUiEnhancement() {
    if (uiQueued) return;
    uiQueued = true;
    requestAnimationFrame(enhanceUi);
  }

  function installUiObserver() {
    var root = document.getElementById("cuddleRoot");
    if (!root || uiObserver) {
      queueUiEnhancement();
      return;
    }
    uiObserver = new MutationObserver(queueUiEnhancement);
    uiObserver.observe(root, { childList: true, subtree: true });
    queueUiEnhancement();
  }

  document.addEventListener("click", function handleMoneyModeClick(event) {
    var button = event.target.closest("[data-cuddle-money-action]");
    if (!button || !activeGame) return;
    event.preventDefault();
    event.stopPropagation();
    var action = button.dataset.cuddleMoneyAction;
    if (action === "starter") {
      activeGame.chooseCuddleStarterReward(button.dataset.rewardId);
    } else if (action === "accept-challenge") {
      acceptChallenge(activeGame);
    } else if (action === "decline-challenge") {
      declineChallenge(activeGame);
    } else if (action === "collect-payout") {
      removeElement("cuddleMoneyPayoutOverlay");
      payoutRunning = false;
      runningPayoutPayload = null;
      requestRender(activeGame);
    }
  }, true);

  window.addEventListener("cuddle:campaign-update", queueUiEnhancement);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installUiObserver);
  else installUiObserver();

  window.CuddleMoneyMode = Object.freeze({
    version: MODE_VERSION,
    config: Object.assign({}, CONFIG, {
      challengeChance: Object.assign({}, CONFIG.challengeChance),
      difficultyRewardBonus: Object.assign({}, CONFIG.difficultyRewardBonus)
    }),
    challenges: CHALLENGES.map(function cloneChallenge(challenge) { return Object.assign({}, challenge); }),
    getActiveGame: function getActiveGame() { return activeGame; },
    acceptChallenge: function acceptCurrentChallenge() { return activeGame ? acceptChallenge(activeGame) : { ok: false }; },
    declineChallenge: function declineCurrentChallenge() { return activeGame ? declineChallenge(activeGame) : { ok: false }; },
    // Called from cuddle-campaign.js's insertMap while stitching together
    // the live play screen -- see activeChallengeBannerMarkup's comment for
    // why this replaced the old post-render DOM patch.
    renderChallengeBanner: function renderChallengeBanner(game) {
      if (!game || !game.state) return "";
      return activeChallengeBannerMarkup(game, ensureMode(game));
    }
  });
}());
