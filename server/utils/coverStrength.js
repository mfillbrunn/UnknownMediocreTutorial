const {
  scoreGuess
} = require("../game-engine/scoring");

const {
  isConsistentWithHistory
} = require("../game-engine/history");

const feasibleCache = new WeakMap();
const analysisCache = new WeakMap();

function normalizeWord(value) {
  return typeof value === "string"
    ? value.trim().toUpperCase()
    : "";
}

function resolveSecrets(allowedSecrets) {
  const source =
    allowedSecrets ||
    global.ALLOWED_SECRETS;

  if (source instanceof Set) {
    return {
      source,
      words: [...source]
    };
  }

  if (Array.isArray(source)) {
    return {
      source,
      words: source
    };
  }

  return {
    source: null,
    words: []
  };
}

function buildHistoryKey(state) {
  const history =
    Array.isArray(state?.history)
      ? state.history
      : [];

  const historyPart = history
    .map(entry => {
      const guess =
        normalizeWord(entry?.guess);

      const feedback =
        Array.isArray(entry?.fb)
          ? entry.fb
              .map(value => value || "")
              .join(",")
          : "";

      return [
        guess,
        entry?.ignoreConstraints
          ? "1"
          : "0",
        feedback
      ].join(":");
    })
    .join("|");

  const constraintsPart =
    (state?.extraConstraints || [])
      .map(constraint => [
        constraint?.type || "",
        constraint?.index ?? "",
        normalizeWord(
          constraint?.letter
        )
      ].join(":"))
      .sort()
      .join("|");

  return (
    `${historyPart}#` +
    `${constraintsPart}`
  );
}

function getFeasibleSecrets(
  state,
  allowedSecrets
) {
  const {
    source,
    words
  } = resolveSecrets(
    allowedSecrets
  );

  if (
    !state ||
    !source ||
    words.length === 0
  ) {
    return {
      key: "",
      words: [],
      set: new Set()
    };
  }

  const key =
    buildHistoryKey(state);

  const sourceLength =
    source instanceof Set
      ? source.size
      : source.length;

  const cached =
    feasibleCache.get(state);

  if (
    cached &&
    cached.key === key &&
    cached.source === source &&
    cached.sourceLength ===
      sourceLength
  ) {
    return cached.result;
  }

  const feasibleWords = [];
  const seen = new Set();

  for (const rawWord of words) {
    const word =
      normalizeWord(rawWord);

    if (
      !/^[A-Z]{5}$/.test(word) ||
      seen.has(word)
    ) {
      continue;
    }

    seen.add(word);

    if (
      isConsistentWithHistory(
        state.history || [],
        word,
        state
      )
    ) {
      feasibleWords.push(word);
    }
  }

  const result = {
    key,
    words: feasibleWords,
    set: new Set(feasibleWords)
  };

  feasibleCache.set(state, {
    key,
    source,
    sourceLength,
    result
  });

  return result;
}

function feedbackKey(
  secret,
  guess
) {
  return scoreGuess(
    secret,
    guess
  ).join("|");
}

function positionalDifferences(
  first,
  second
) {
  if (
    first.length !==
    second.length
  ) {
    return Infinity;
  }

  let differences = 0;

  for (
    let i = 0;
    i < first.length;
    i++
  ) {
    if (
      first[i] !== second[i]
    ) {
      differences++;
    }
  }

  return differences;
}

function passesAssassinRule(
  word,
  state
) {
  const assassinWord =
    normalizeWord(
      state?.powers?.assassinWord
    );

  return (
    !assassinWord ||
    positionalDifferences(
      word,
      assassinWord
    ) >= 2
  );
}

function getCoverAnalysis(
  state,
  allowedSecrets
) {
  const pendingGuess =
    normalizeWord(
      state?.pendingGuess
    );

  const currentSecret =
    normalizeWord(
      state?.secret
    );

  if (
    !state ||
    !/^[A-Z]{5}$/.test(
      pendingGuess
    ) ||
    !/^[A-Z]{5}$/.test(
      currentSecret
    )
  ) {
    return null;
  }

  const {
    source,
    words
  } = resolveSecrets(
    allowedSecrets
  );

  if (
    !source ||
    words.length === 0
  ) {
    return null;
  }

  const feasible =
    getFeasibleSecrets(
      state,
      source
    );

  const assassinWord =
    normalizeWord(
      state?.powers?.assassinWord
    );

  const key = [
    feasible.key,
    pendingGuess,
    currentSecret,
    assassinWord
  ].join("#");

  const sourceLength =
    source instanceof Set
      ? source.size
      : source.length;

  const cached =
    analysisCache.get(state);

  if (
    cached &&
    cached.key === key &&
    cached.source === source &&
    cached.sourceLength ===
      sourceLength
  ) {
    return cached.result;
  }

  const bucketCounts =
    new Map();

  const signatureByWord =
    new Map();

  /*
   * Every feasible secret is scored
   * against the pending guess once.
   */
  for (
    const word of feasible.words
  ) {
    const signature =
      feedbackKey(
        word,
        pendingGuess
      );

    signatureByWord.set(
      word,
      signature
    );

    bucketCounts.set(
      signature,
      (
        bucketCounts.get(
          signature
        ) || 0
      ) + 1
    );
  }

  const keepSignature =
    feedbackKey(
      currentSecret,
      pendingGuess
    );

  const keepCount =
    bucketCounts.get(
      keepSignature
    ) || 0;

  let bestCount = null;
  let betterCount = 0;
  let switchCount = 0;

  for (
    const word of feasible.words
  ) {
    /*
     * The best-switch comparison
     * excludes keeping the same word,
     * matching the pending guess, and
     * assassin-incompatible secrets.
     */
    if (
      word === currentSecret ||
      word === pendingGuess ||
      !passesAssassinRule(
        word,
        state
      )
    ) {
      continue;
    }

    switchCount++;

    const signature =
      signatureByWord.get(word);

    const count =
      bucketCounts.get(
        signature
      ) || 0;

    if (
      bestCount == null ||
      count > bestCount
    ) {
      bestCount = count;
    }

    if (
      count > keepCount
    ) {
      betterCount++;
    }
  }

  const bestImprovementPct =
    keepCount > 0 &&
    bestCount != null &&
    bestCount > keepCount
      ? Math.round(
          (
            (
              bestCount -
              keepCount
            ) /
            keepCount
          ) * 100
        )
      : 0;

  const result = {
    pendingGuess,
    currentSecret,

    feasibleWords:
      feasible.words,

    feasibleSet:
      feasible.set,

    bucketCounts,
    signatureByWord,

    keepCount,
    bestCount,
    betterCount,
    switchCount,
    bestImprovementPct
  };

  analysisCache.set(state, {
    key,
    source,
    sourceLength,
    result
  });

  return result;
}

function getCandidateRemainingCount(
  analysis,
  candidateWord
) {
  const word =
    normalizeWord(
      candidateWord
    );

  if (
    !analysis ||
    !/^[A-Z]{5}$/.test(word)
  ) {
    return null;
  }

  const signature =
    analysis
      .signatureByWord
      .get(word) ||
    feedbackKey(
      word,
      analysis.pendingGuess
    );

  return (
    analysis
      .bucketCounts
      .get(signature) ||
    0
  );
}

function starsForGap(gapPct) {
  // Base stars top out at 2 -- reaching 3 requires the separate bonus star
  // (bonusStar below), never a base switch alone. Mirrors starsForCandidate
  // in powers/powers/spyChargeServer.js, which is what actually awards
  // them. These two must agree or the preview lies about the payout.
  if (gapPct < 25) {
    return 2;
  }

  // Baseline one star for any legal decision.
  return 1;
}

function buildCoverStrengthState(
  state,
  allowedSecrets,
  draftSecret
) {
  const pendingGuess =
    normalizeWord(
      state?.pendingGuess
    );

  /*
   * Hide the rating when changing is
   * unavailable or the calculation
   * would reveal hidden information.
   * The Star Tutorial (client/tutorial-star.js) is the one exception --
   * it walks the player through this live, so the preview needs to
   * actually show up for it same as a real match.
   */
  const blocked =
    !state ||
    (state.isTutorial && state.tutorialStage !== "star") ||
    state.phase !== "normal" ||
    state.turn !== state.setter ||
    !/^[A-Z]{5}$/.test(
      pendingGuess
    ) ||
    !!state.powers
      ?.stealthGuessActive ||
    !!state.powers
      ?.freezeActive ||
    !!state.powers
      ?.rouletteSecretActive ||
    !!state.powers
      ?.doubleGuessPending;

  if (blocked) {
    return {
      visible: false
    };
  }

  /*
   * The secret can't be changed at all this turn -- an all-wrong
   * simultaneous opening forces the setter to keep what they had
   * (see client.js's isOpeningMissSecretLocked). There's no legal
   * switch to rate against, so skip the analysis and show a flat
   * locked rating instead of hiding the stars outright for the
   * whole locked turn. Lockdown (freezeActive) is a deliberately
   * drafted/random power activation, not this same "stuck with
   * whatever you had" case, so it stays fully hidden above with
   * the other blocked reasons.
   *
   * The forced/default opening Keep earns exactly one base star (see
   * spyChargeServer.js's createFlatDecisionAward) -- this preview must
   * agree with that real award, not the old flat 2 stars this used to
   * show for this turn.
   */
  const secretLocked =
    !!state.simultaneousAllWrong;

  if (secretLocked) {
    return {
      visible: true,
      status: "locked",
      stars: 1,
      hasUpgrade: false,
      keepCount: null,
      bestCount: null,
      betterCount: null,
      bestImprovementPct: null,
      draftComplete: false,
      draftValid: false,
      draftIsCurrent: false,
      draftIsPending: false,
      draftCount: null,
      draftGapPct: null,
      bonusAvailable: false,
      bonusStar: false
    };
  }

  const analysis =
    getCoverAnalysis(
      state,
      allowedSecrets
    );

  if (!analysis) {
    return {
      visible: false
    };
  }

  const hasUpgrade =
    analysis.bestCount != null &&
    analysis.bestCount >
      analysis.keepCount;

  const draft =
    normalizeWord(
      draftSecret
    );

  const draftComplete =
    /^[A-Z]{5}$/.test(draft);

  const draftIsCurrent =
    draftComplete &&
    draft ===
      analysis.currentSecret;

  const draftIsPending =
    draftComplete &&
    draft ===
      analysis.pendingGuess;

  const draftValid =
    draftComplete &&
    analysis.feasibleSet.has(
      draft
    ) &&
    passesAssassinRule(
      draft,
      state
    );

  const draftCount =
    draftValid
      ? getCandidateRemainingCount(
          analysis,
          draft
        )
      : null;

  let gapPct = null;
  let stars = 0;
  let status = "available";

  if (!draftComplete) {
    if (draft.length === 0) {
      // Nothing typed yet -- an empty draft submits as "keep the current
      // secret" (see client.js's computeSetterSecretStatus), so show what
      // that's actually worth right away instead of waiting for the
      // setter to explicitly retype it. Keeping always earns the flat
      // 1-star baseline, same as every other legal decision -- see
      // starsForGap.
      status = "same";
      stars = 1;
    } else {
      status = "available";
    }
  } else if (!draftValid) {
    status = "invalid";
  } else if (draftIsCurrent) {
    // Keeping the current secret is still a legal decision, so it earns
    // the same baseline star any other legal choice does (see
    // starsForGap) rather than reading as nothing gained.
    status = "same";
    stars = 1;
  } else if (draftIsPending) {
    status = "loses";
  } else if (
    analysis.bestCount == null ||
    analysis.bestCount <= 0
  ) {
    status = "unrated";
  } else {
    status = "rated";

    const rawGapPct = Math.max(
      0,
      (
        (
          analysis.bestCount -
          draftCount
        ) /
        analysis.bestCount
      ) * 100
    );

    gapPct = Math.round(
      rawGapPct
    );

    stars = starsForGap(
      rawGapPct
    );
  }

  const chargeHint =
    state.powers?.spyCharge?.hint;

  const bonusAvailable = !!(
    chargeHint?.letter &&
    Number.isInteger(
      chargeHint.position
    )
  );

  const bonusStar = !!(
    bonusAvailable &&
    draftValid &&
    !draftIsCurrent &&
    !draftIsPending &&
    draft[
      chargeHint.position
    ] === chargeHint.letter
  );

  return {
    visible: true,
    status,
    stars,

    hasUpgrade,

    keepCount:
      analysis.keepCount,

    bestCount:
      analysis.bestCount,

    betterCount:
      analysis.betterCount,

    bestImprovementPct:
      analysis.bestImprovementPct,

    draftComplete,
    draftValid,
    draftIsCurrent,
    draftIsPending,
    draftCount,
    draftGapPct: gapPct,
    bonusAvailable,
    bonusStar
  };
}

module.exports = {
  getFeasibleSecrets,
  getCoverAnalysis,
  getCandidateRemainingCount,
  buildCoverStrengthState
};

// COMPETITIVE OVERHAUL V3: BEST WORD EXPORT START
// Add a deterministic best-word label without changing the existing cover
// calculation. Ties are sorted so archived summaries do not depend on Set
// insertion order.
if (!module.exports.__competitiveBestWordV3) {
  const originalGetCoverAnalysisV3 = module.exports.getCoverAnalysis;
  module.exports.getCoverAnalysis = function getCoverAnalysisWithBestWord(state, allowedSecrets) {
    const analysis = originalGetCoverAnalysisV3.call(this, state, allowedSecrets);
    if (!analysis || typeof analysis !== "object") return analysis;

    const bestCount = Number(analysis.bestCount);
    const bestWords = Array.from(analysis.feasibleWords || [])
      .filter(word => {
        if (word === analysis.currentSecret || word === analysis.pendingGuess) return false;
        const signature = analysis.signatureByWord?.get(word);
        const count = analysis.bucketCounts?.get(signature) || 0;
        return (
          Number.isFinite(bestCount) &&
          count === bestCount &&
          passesAssassinRule(word, state)
        );
      })
      .map(word => String(word || "").trim().toUpperCase())
      .filter(word => /^[A-Z]{5}$/.test(word))
      .sort();

    if (!bestWords.length && /^[A-Z]{5}$/.test(String(analysis.currentSecret || ""))) {
      bestWords.push(String(analysis.currentSecret).toUpperCase());
    }

    return {
      ...analysis,
      bestWords,
      bestWord: bestWords[0] || null
    };
  };
  module.exports.__competitiveBestWordV3 = true;
}
// COMPETITIVE OVERHAUL V3: BEST WORD EXPORT END
