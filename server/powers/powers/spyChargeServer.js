const {
  getCoverAnalysis,
  getCandidateRemainingCount
} = require("../../utils/coverStrength");

const {
  isConsistentWithHistory
} = require("../../game-engine/history");
const {
  hasLetterKnowledge,
  eraseLetterKnowledge
} = require("../../utils/resetLetterKnowledge");

const POWER_METADATA = require("../powerMetadata");

const MAX_CHARGE = 12;
const POWER_UNLOCK_AT = 8;
const RESET_THRESHOLDS = [4, 12];

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

  // Disabled for every tutorial EXCEPT the Star Tutorial itself (see
  // client/tutorial-star.js), which is specifically about walking the
  // player through this live -- real secret changes, real stars, a real
  // second-power unlock and letter reset -- rather than narrating it.
  const isStarTutorial =
    state?.isTutorial && state?.tutorialStage === "star";

  return {
    enabled: (!state?.isTutorial || isStarTutorial) && !state?.devMode,
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

// Same as isDecisionEligible, but a Hidden Guess (doubleGuessPending) turn
// still counts as eligible here -- it must still award exactly one star
// (see evaluateSecretChange's doubleGuessPending branch below), just never
// a bonus hint. isDecisionEligible itself stays untouched and keeps
// excluding doubleGuessPending: rollHintForTurn and the hint-validity
// check both still gate on it directly, so no bonus-star hint is ever
// rolled or offered while a Hidden Guess decision is pending -- that's
// what actually suppresses the bonus star, not a separate check here.
function isScoringEligible(state) {
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

  // UMT_TUTORIAL_REWORK_20260901: SCRIPTED STAR HINT
  // The Star Tutorial needs two concrete, legal words on each practice turn:
  // one that earns two base stars and hits the bonus position, and one weaker
  // word that misses that position. The tutorial evaluator below awards the
  // exact scripted 3/1 totals only when the matching word is submitted.
  if (state?.isTutorial && state?.tutorialStage === "star") {
    const practiceStep = Math.max(
      0,
      Math.trunc(Number(charge.tutorialPracticeStep) || 0)
    );
    const currentSecret = normalizeWord(state.secret);
    const bestFirst = candidates
      .slice()
      .sort((a, b) =>
        b.count - a.count || a.word.localeCompare(b.word)
      );
    const worstFirst = candidates
      .slice()
      .sort((a, b) =>
        a.count - b.count || a.word.localeCompare(b.word)
      );
    const good =
      bestFirst.find(candidate =>
        starsForCandidate(candidate.count, analysis.bestCount) === 2
      ) || bestFirst[0];
    const weak =
      worstFirst.find(candidate =>
        starsForCandidate(candidate.count, analysis.bestCount) === 1
      ) || worstFirst[0];

    if (good && weak && practiceStep === 0) {
      let position = -1;
      for (let index = 0; index < 5; index++) {
        if (good.word[index] && good.word[index] !== currentSecret[index]) {
          position = index;
          break;
        }
      }
      if (position < 0) position = 0;
      const tutorialHint = {
        letter: good.word[position],
        position,
        word: good.word,
        worseWord: weak.word
      };
      charge.hint = tutorialHint;
      return tutorialHint;
    }

    if (good && weak && practiceStep === 1) {
      let target = null;
      for (const source of bestFirst) {
        for (let position = 0; position < 5; position++) {
          const letter = source.word[position];
          if (
            letter &&
            letter !== currentSecret[position] &&
            weak.word[position] !== letter
          ) {
            target = { letter, position };
            break;
          }
        }
        if (target) break;
      }

      // Extremely small feasible pools can lack a normal best-word target
      // that the weak word misses. A synthetic letter target is safe in this
      // tutorial-only branch and still guarantees the requested 1-star demo.
      if (!target) {
        const position = 0;
        target = {
          letter: weak.word[position] === "A" ? "B" : "A",
          position
        };
      }

      const tutorialHint = {
        ...target,
        word: good.word,
        worseWord: weak.word
      };
      charge.hint = tutorialHint;
      return tutorialHint;
    }
  }

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

  /*
   * Higher candidateCount is better for the setter because the resulting
   * feedback leaves more feasible secrets alive.
   *
   * - equal to the best: 2 base stars
   * - less than 25% worse: 2 base stars
   * - exactly 25% worse or more: 1 base star
   *
   * The blue letter bonus is separate and is never included here.
   */
  if (candidateCount >= bestCount) {
    return 2;
  }

  const gapPct =
    ((bestCount - candidateCount) / bestCount) * 100;

  return gapPct < 25 ? 2 : 1;
}

// Special accepted decisions use a flat base award and no bonus.

function createFlatDecisionAward(
  state,
  baseStars = 1
) {
  const charge = getCharge(state);

  const before = Math.min(
    MAX_CHARGE,
    Math.max(
      0,
      Number(charge?.total) || 0
    )
  );

  const base = charge?.enabled
    ? Math.min(
        2,
        Math.max(
          0,
          Math.trunc(
            Number(baseStars) || 0
          )
        )
      )
    : 0;

  return {
    before,
    baseStars: base,
    bonusStars: 0,
    earnedStars: base,
    candidateCount: null,
    bestCount: null,
    bestWord: null,
    bestWords: []
  };
}

function evaluateSecretChange(
  state,
  newSecret,
  allowedSecrets
) {
  const charge = getCharge(state);
  const before = Math.min(
    MAX_CHARGE,
    Math.max(0, Number(charge?.total) || 0)
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

  // The forced opening KEEP is an accepted KEEP and earns one base star.
  if (state.simultaneousAllWrong) {
    return createFlatDecisionAward(state, 1);
  }

  if (!isScoringEligible(state)) {
    return empty;
  }

  const word = normalizeWord(newSecret);
  const currentSecret = normalizeWord(state.secret);
  const pendingGuess = normalizeWord(state.pendingGuess);

  if (
    !/^[A-Z]{5}$/.test(word) ||
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
    !analysis.feasibleSet.has(word)
  ) {
    return empty;
  }

  // UMT_TUTORIAL_REWORK_20260901: SCRIPTED STAR EVALUATION
  const tutorialPracticeStep =
    state?.isTutorial && state?.tutorialStage === "star"
      ? Math.max(0, Math.trunc(Number(charge.tutorialPracticeStep) || 0))
      : null;
  const tutorialExpectedWord =
    tutorialPracticeStep === 0
      ? normalizeWord(charge.hint?.word)
      : tutorialPracticeStep === 1
        ? normalizeWord(charge.hint?.worseWord)
        : "";

  // A legal but different decision can still be played, but it earns zero
  // tutorial stars and cannot advance either exercise. The exact highlighted
  // word is therefore required before the tutorial moves on.
  if (
    tutorialPracticeStep != null &&
    tutorialPracticeStep < 2 &&
    (!tutorialExpectedWord || word !== tutorialExpectedWord)
  ) {
    return {
      ...empty,
      tutorialPracticeStep,
      tutorialExpectedWord: tutorialExpectedWord || null,
      tutorialPracticeAccepted: false
    };
  }

  const changedSecret =
    word !== currentSecret;

  /*
   * KEEP is not quality-rated. Every accepted KEEP earns exactly one
   * normal base star and can never earn the blue bonus star.
   */
  if (!changedSecret) {
    return {
      before,
      baseStars: 1,
      bonusStars: 0,
      earnedStars: 1,
      candidateCount:
        Number(analysis.keepCount) || 0,
      bestCount:
        analysis.bestCount ??
        analysis.keepCount ??
        null
    };
  }

  if (
    analysis.bestCount == null ||
    analysis.bestCount <= 0
  ) {
    return empty;
  }

  const candidateCount =
    getCandidateRemainingCount(
      analysis,
      word
    );

  if (tutorialPracticeStep != null && tutorialPracticeStep < 2) {
    const tutorialBaseStars = tutorialPracticeStep === 0 ? 2 : 1;
    const tutorialBonusStars = tutorialPracticeStep === 0 ? 1 : 0;
    return {
      before,
      baseStars: tutorialBaseStars,
      bonusStars: tutorialBonusStars,
      earnedStars: tutorialBaseStars + tutorialBonusStars,
      candidateCount,
      bestCount: analysis.bestCount,
      tutorialPracticeStep,
      tutorialExpectedWord,
      tutorialPracticeAccepted: true
    };
  }

  // Preserve the existing Hidden Guess rule: exactly one, no bonus.
  if (state.powers?.doubleGuessPending) {
    return {
      before,
      baseStars: 1,
      bonusStars: 0,
      earnedStars: 1,
      candidateCount,
      bestCount: analysis.bestCount
    };
  }

  const baseStars = starsForCandidate(
    candidateCount,
    analysis.bestCount
  );

  /*
   * The blue bonus is independent of quality, but only a changed secret
   * can earn it.
   */
  const hint = charge.hint;
  const bonusStars =
    changedSecret &&
    hint &&
    word[hint.position] === hint.letter
      ? 1
      : 0;

  return {
    before,
    baseStars,
    bonusStars,
    earnedStars:
      Math.min(3, baseStars + bonusStars),
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

  // Defensive normalization: no caller-supplied award, however it was
  // computed, can ever request more than the invariant allows (2 base, 1
  // bonus) -- this is the last gate before the meter total and the
  // emitted payload both get built from it.
  const requestedBaseStars = Math.min(
    2,
    Math.max(
      0,
      Math.trunc(
        Number(award?.baseStars) || 0
      )
    )
  );

  const requestedBonusStars = Math.min(
    1,
    Math.max(
      0,
      Math.trunc(
        Number(award?.bonusStars) || 0
      )
    )
  );

  const available = MAX_CHARGE - before;

  const appliedBaseStars = Math.min(
    available,
    requestedBaseStars
  );

  const appliedBonusStars = Math.min(
    available - appliedBaseStars,
    requestedBonusStars
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
    baseStars: requestedBaseStars,
    bonusStars: requestedBonusStars,
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
  return hasLetterKnowledge(state, letter);
}

function eraseLetterFeedback(state, letter) {
  return eraseLetterKnowledge(state, [letter]);
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
  createFlatDecisionAward,
  commitAward,
  letterHasFeedback,
  attemptReset,
  chooseHintedBestSecret
};

// COMPETITIVE OVERHAUL V3: STAR FLOOR + ARCHIVE BEST WORD START
// Keep the simultaneous all-wrong award intact, ensure a legal Keep earns one
// star in every game mode, add decision-time best-word data, and attach the
// final award to the just-scored history row.
if (!module.exports.__competitiveHistoryMetricsV3) {
  const coverStrengthV3 = require("../../utils/coverStrength");
  const originalEvaluateSecretChangeV3 = module.exports.evaluateSecretChange;
  const originalCommitAwardV3 = module.exports.commitAward;

  module.exports.evaluateSecretChange = function evaluateSecretChangeWithHistoryData(
    state,
    newSecret,
    allowedSecrets
  ) {
    const award =
      originalEvaluateSecretChangeV3.call(
        this,
        state,
        newSecret,
        allowedSecrets
      );

    if (
      !award ||
      typeof award !== "object"
    ) {
      return award;
    }

    // Star calculation now lives entirely in the core evaluator above.
    const analysis =
      coverStrengthV3.getCoverAnalysis(
        state,
        allowedSecrets
      );

    return {
      ...award,
      bestWord:
        analysis?.bestWord || null,
      bestWords:
        Array.isArray(analysis?.bestWords)
          ? analysis.bestWords
          : []
    };
  };
  module.exports.commitAward = function commitAwardWithHistoryMetrics(state, award, room, io) {
    const result = originalCommitAwardV3.call(this, state, award, room, io);
    const entry = Array.isArray(state?.history) ? state.history[state.history.length - 1] : null;
    if (entry && award) {
      entry.starsEarned = Number(result?.appliedStars ?? award.earnedStars ?? 0) || 0;
      entry.baseStarsEarned = Number(result?.appliedBaseStars ?? award.baseStars ?? 0) || 0;
      entry.bonusStarsEarned = Number(result?.appliedBonusStars ?? award.bonusStars ?? 0) || 0;
      if (Number.isFinite(Number(award.candidateCount))) {
        entry.remainingAfter = Number(award.candidateCount);
      }
      entry.bestWord = award.bestWord || entry.bestWord || null;
    }
    return result;
  };

  module.exports.__competitiveHistoryMetricsV3 = true;
}
// COMPETITIVE OVERHAUL V3: STAR FLOOR + ARCHIVE BEST WORD END
