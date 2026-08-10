const {
  getCoverAnalysis,
  getCandidateRemainingCount
} = require("../../utils/coverStrength");

const {
  isConsistentWithHistory
} = require("../../game-engine/history");

const POWER_METADATA = require("../powerMetadata");

const MAX_CHARGE = 12;
const POWER_UNLOCK_AT = 5;
const RESET_THRESHOLDS = [8, 12];

function normalizeWord(value) {
  return typeof value === "string"
    ? value.trim().toUpperCase()
    : "";
}

function positionalDifferences(first, second) {
  if (first.length !== second.length) return Infinity;

  let count = 0;
  for (let i = 0; i < first.length; i++) {
    if (first[i] !== second[i]) count++;
  }
  return count;
}

function passesAssassinRule(word, state) {
  const assassinWord = normalizeWord(
    state?.powers?.assassinWord
  );

  return (
    !assassinWord ||
    positionalDifferences(word, assassinWord) >= 2
  );
}

function getSetterPowerIds(state) {
  if (state?.customPowersMode) {
    return [
      ...(
        state.customPlayerPowers
          ?.[state.setter]
          ?.setterPowers || []
      )
    ];
  }

  if (Array.isArray(state?.initialPowers?.setter)) {
    return [...state.initialPowers.setter];
  }

  return (state?.activePowers || []).filter(
    powerId => POWER_METADATA[powerId]?.role === "setter"
  );
}

function createSpyChargeState(state, setterPowerIds) {
  const powers = Array.isArray(setterPowerIds)
    ? setterPowerIds
    : getSetterPowerIds(state);

  return {
    enabled: !state?.isTutorial && !state?.devMode,
    total: 0,
    hint: null,
    lockedPowerId: powers[1] || null,
    resetsUsed: 0,
    resetLetters: []
  };
}

function initializeForRound(state, setterPowerIds) {
  if (!state?.powers) return;

  state.powers.spyCharge = createSpyChargeState(
    state,
    setterPowerIds
  );
}

function getCharge(state) {
  return state?.powers?.spyCharge || null;
}

function isPowerLocked(state, powerId) {
  const charge = getCharge(state);

  return !!(
    charge?.enabled &&
    charge.lockedPowerId &&
    charge.lockedPowerId === powerId &&
    (charge.total || 0) < POWER_UNLOCK_AT
  );
}

function getUnlockedResetCount(state) {
  const total = getCharge(state)?.total || 0;

  return RESET_THRESHOLDS.reduce(
    (count, threshold) =>
      count + (total >= threshold ? 1 : 0),
    0
  );
}

function getAvailableResetCount(state) {
  const charge = getCharge(state);
  if (!charge?.enabled) return 0;

  return Math.max(
    0,
    getUnlockedResetCount(state) -
      (charge.resetsUsed || 0)
  );
}

function isDecisionEligible(state) {
  return !!(
    getCharge(state)?.enabled &&
    state.phase === "normal" &&
    state.turn === state.setter &&
    /^[A-Z]{5}$/.test(
      normalizeWord(state.pendingGuess)
    ) &&
    !state.powers?.stealthGuessActive &&
    !state.powers?.freezeActive &&
    !state.powers?.rouletteSecretActive &&
    !state.powers?.doubleGuessPending &&
    !state.simultaneousAllWrong
  );
}

function legalAlternativeCandidates(
  state,
  allowedSecrets,
  analysis
) {
  const currentSecret = normalizeWord(state.secret);
  const pendingGuess = normalizeWord(state.pendingGuess);

  return analysis.feasibleWords
    .filter(word => {
      const upper = normalizeWord(word);

      return (
        upper !== currentSecret &&
        upper !== pendingGuess &&
        passesAssassinRule(upper, state)
      );
    })
    .map(word => {
      const upper = normalizeWord(word);

      return {
        word: upper,
        count:
          getCandidateRemainingCount(
            analysis,
            upper
          ) || 0
      };
    });
}

function chooseHintFromBestCandidates(
  state,
  candidates,
  bestCount
) {
  const currentSecret = normalizeWord(state.secret);
  const pendingLetters = new Set(
    normalizeWord(state.pendingGuess).split("")
  );

  const bestWords = candidates
    .filter(candidate => candidate.count === bestCount)
    .map(candidate => candidate.word);

  const pairMap = new Map();

  for (const word of bestWords) {
    for (let position = 0; position < 5; position++) {
      const letter = word[position];

      if (!letter || currentSecret[position] === letter) {
        continue;
      }

      const key = `${letter}@${position}`;
      const current = pairMap.get(key) || {
        letter,
        position,
        support: 0,
        avoidsPending: !pendingLetters.has(letter)
      };

      current.support++;
      pairMap.set(key, current);
    }
  }

  const options = [...pairMap.values()];
  if (!options.length) return null;

  options.sort((a, b) => {
    if (a.avoidsPending !== b.avoidsPending) {
      return a.avoidsPending ? -1 : 1;
    }

    if (a.support !== b.support) {
      return b.support - a.support;
    }

    return Math.random() - 0.5;
  });

  const selected = options[0];

  return {
    letter: selected.letter,
    position: selected.position
  };
}

function rollHintForTurn(state, allowedSecrets) {
  const charge = getCharge(state);
  if (!charge) return null;

  charge.hint = null;

  if (!isDecisionEligible(state)) {
    return null;
  }

  const analysis = getCoverAnalysis(
    state,
    allowedSecrets
  );

  if (!analysis || analysis.bestCount == null) {
    return null;
  }

  const candidates = legalAlternativeCandidates(
    state,
    allowedSecrets,
    analysis
  );

  if (!candidates.length) return null;

  const hint = chooseHintFromBestCandidates(
    state,
    candidates,
    analysis.bestCount
  );

  if (!hint) return null;

  charge.hint = hint;
  return hint;
}

function starsForCandidate(candidateCount, bestCount) {
  if (
    !Number.isFinite(candidateCount) ||
    !Number.isFinite(bestCount) ||
    candidateCount <= 0 ||
    bestCount <= 0
  ) {
    return 0;
  }

  const gapPct = Math.max(
    0,
    ((bestCount - candidateCount) / bestCount) * 100
  );

  let stars = 0;

  if (gapPct < 10) {
    stars = 3;
  } else if (gapPct < 25) {
    stars = 2;
  } else if (gapPct < 50) {
    stars = 1;
  }

  if (candidateCount <= 4) {
    return Math.min(stars, 1);
  }

  if (candidateCount <= 9) {
    return Math.min(stars, 2);
  }

  return stars;
}

function evaluateSecretChange(
  state,
  newSecret,
  allowedSecrets
) {
  const charge = getCharge(state);
  const before = Math.min(
    MAX_CHARGE,
    Math.max(0, charge?.total || 0)
  );

  const empty = {
    before,
    baseStars: 0,
    bonusStars: 0,
    earnedStars: 0,
    candidateCount: null,
    bestCount: null
  };

  if (!charge?.enabled) {
    return empty;
  }

  // Mirrors coverStrength.js's buildCoverStrengthState -- an all-wrong
  // simultaneous opening forces the setter to keep whatever secret they
  // had, so there's no legal alternative to rate a switch against. Award
  // the same flat 2 stars the UI already shows for this turn instead of
  // silently earning nothing just because "keeping" is normally a
  // zero-reward no-op switch (see the word === currentSecret check
  // below, which this intentionally bypasses).
  if (state.simultaneousAllWrong) {
    return {
      ...empty,
      baseStars: 2,
      earnedStars: 2
    };
  }

  if (!isDecisionEligible(state)) {
    return empty;
  }

  const word = normalizeWord(newSecret);
  const currentSecret = normalizeWord(state.secret);
  const pendingGuess = normalizeWord(state.pendingGuess);

  if (
    !/^[A-Z]{5}$/.test(word) ||
    word === currentSecret ||
    word === pendingGuess ||
    !passesAssassinRule(word, state)
  ) {
    return empty;
  }

  const analysis = getCoverAnalysis(
    state,
    allowedSecrets
  );

  if (
    !analysis ||
    analysis.bestCount == null ||
    !analysis.feasibleSet.has(word)
  ) {
    return empty;
  }

  const candidateCount =
    getCandidateRemainingCount(
      analysis,
      word
    );

  const baseStars = starsForCandidate(
    candidateCount,
    analysis.bestCount
  );

  const hint = charge.hint;
  const bonusStars =
    hint &&
    word[hint.position] === hint.letter
      ? 1
      : 0;

  return {
    before,
    baseStars,
    bonusStars,
    earnedStars: baseStars + bonusStars,
    candidateCount,
    bestCount: analysis.bestCount
  };
}

function commitAward(
  state,
  award,
  room,
  io
) {
  const charge = getCharge(state);
  if (!charge?.enabled) return null;

  const before = Math.min(
    MAX_CHARGE,
    Math.max(
      0,
      Number(award?.before) ||
        Number(charge.total) ||
        0
    )
  );

  const available = MAX_CHARGE - before;

  const appliedBaseStars = Math.min(
    available,
    Math.max(0, Number(award?.baseStars) || 0)
  );

  const appliedBonusStars = Math.min(
    available - appliedBaseStars,
    Math.max(0, Number(award?.bonusStars) || 0)
  );

  const appliedStars =
    appliedBaseStars + appliedBonusStars;

  const after = Math.min(
    MAX_CHARGE,
    before + appliedStars
  );

  charge.total = after;
  charge.hint = null;

  const unlockedPowerId =
    before < POWER_UNLOCK_AT &&
    after >= POWER_UNLOCK_AT
      ? charge.lockedPowerId || null
      : null;

  const resetMilestones = RESET_THRESHOLDS.filter(
    threshold => before < threshold && after >= threshold
  );

  const payload = {
    before,
    after,
    baseStars: Math.max(0, Number(award?.baseStars) || 0),
    bonusStars: Math.max(0, Number(award?.bonusStars) || 0),
    appliedBaseStars,
    appliedBonusStars,
    appliedStars,
    unlockedPowerId,
    resetMilestones
  };

  const setterSocketId =
    room?.playersByUserId
      ?.[state.setter]
      ?.socketId;

  if (setterSocketId) {
    io.to(setterSocketId).emit(
      "spyChargeAward",
      payload
    );
  }

  return payload;
}

function letterHasFeedback(state, letter) {
  const target = String(letter || "").toUpperCase();
  if (!/^[A-Z]$/.test(target)) return false;

  for (const entry of state.history || []) {
    const guess = normalizeWord(entry?.guess);

    for (let index = 0; index < guess.length; index++) {
      if (guess[index] !== target) continue;

      if (
        (Array.isArray(entry.fb) && entry.fb[index]) ||
        (
          Array.isArray(entry.fbGuesser) &&
          entry.fbGuesser[index]
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function eraseLetterFeedback(state, letter) {
  for (const entry of state.history || []) {
    const guess = normalizeWord(entry?.guess);

    for (let index = 0; index < guess.length; index++) {
      if (guess[index] !== letter) continue;

      if (Array.isArray(entry.fb)) {
        entry.fb[index] = "";
      }

      if (Array.isArray(entry.fbGuesser)) {
        entry.fbGuesser[index] = "";
      }
    }
  }
}

function attemptReset(
  state,
  userId,
  letter,
  roomId,
  io,
  allowedSecrets
) {
  const charge = getCharge(state);

  if (!charge?.enabled) return false;
  if (userId !== state.setter) return false;
  if (state.phase !== "normal") return false;
  if (state.turn !== state.setter) return false;
  if (!state.pendingGuess) return false;
  if (getAvailableResetCount(state) <= 0) return false;

  const target = String(letter || "").toUpperCase();

  if (!/^[A-Z]$/.test(target)) return false;
  if (!letterHasFeedback(state, target)) return false;

  eraseLetterFeedback(state, target);

  charge.resetsUsed =
    (charge.resetsUsed || 0) + 1;

  charge.resetLetters = [
    ...(charge.resetLetters || []),
    target
  ];

  if (state.powers?.rouletteSecretActive) {
    state.powers.rouletteSecretFeasible =
      (allowedSecrets || global.ALLOWED_SECRETS || []).filter(secret =>
        isConsistentWithHistory(
          state.history,
          secret,
          state
        )
      );
  }

  const powerPayload = {
    type: "spyChargeReset",
    letter: target
  };

  io.to(roomId).emit(
    "powerUsed",
    powerPayload
  );

  if (!Array.isArray(state._pendingPowerEvents)) {
    state._pendingPowerEvents = [];
  }

  const logPayload = {
    id: "spyChargeReset",
    actorRole: "setter",
    emissions: [
      {
        event: "powerUsed",
        payload: powerPayload
      }
    ]
  };

  state._pendingPowerEvents.push(logPayload);

  io.to(roomId).emit(
    "powerActivity",
    logPayload
  );

  rollHintForTurn(
    state,
    allowedSecrets || global.ALLOWED_SECRETS
  );

  return true;
}

function chooseHintedBestSecret(
  state,
  allowedSecrets,
  fallbackSecret
) {
  const charge = getCharge(state);
  const hint = charge?.hint;

  if (!hint || !isDecisionEligible(state)) {
    return fallbackSecret;
  }

  const analysis = getCoverAnalysis(
    state,
    allowedSecrets
  );

  if (!analysis || analysis.bestCount == null) {
    return fallbackSecret;
  }

  const bestMatching = legalAlternativeCandidates(
    state,
    allowedSecrets,
    analysis
  ).filter(candidate =>
    candidate.count === analysis.bestCount &&
    candidate.word[hint.position] === hint.letter
  );

  if (!bestMatching.length) {
    return fallbackSecret;
  }

  return bestMatching[
    Math.floor(Math.random() * bestMatching.length)
  ].word;
}

module.exports = {
  MAX_CHARGE,
  POWER_UNLOCK_AT,
  RESET_THRESHOLDS,
  createSpyChargeState,
  initializeForRound,
  getSetterPowerIds,
  isPowerLocked,
  getAvailableResetCount,
  rollHintForTurn,
  starsForCandidate,
  evaluateSecretChange,
  commitAward,
  letterHasFeedback,
  attemptReset,
  chooseHintedBestSecret
};
