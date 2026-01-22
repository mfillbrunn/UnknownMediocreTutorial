const { isConsistentWithHistory } = require("../../game-engine/history");
const { satisfiesForceGuess } = require("../../game-engine/validation");
const { scoreGuess } = require("../../game-engine/scoring");

/* ===============================
   ENTRY POINTS
   =============================== */

function pickGuess(state, allowedGuesses, guessParams) {
  return pickAIGuess(state, allowedGuesses, guessParams);
}

function pickSecret(state, secretRows, setterParams) {
  return pickAISecret(state, secretRows, setterParams);
}

function createAI({ guessParams, setterParams }) {
  return {
    pickGuess(state, words) {
      return pickAIGuess(state, words, guessParams);
    },
    pickSecret(state, secrets) {
      return pickAISecret(state, secrets, setterParams);
    }
  };
}

/* ===============================
   SHARED UTILITIES
   =============================== */

function weightedRandom(items, weightFn) {
  if (!items.length) return null;
  const total = items.reduce((s, x) => s + weightFn(x), 0);
  if (total <= 0) {
    return items[Math.floor(Math.random() * items.length)];
  }
  let r = Math.random() * total;
  for (const item of items) {
    r -= weightFn(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function weightedChoice(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [key, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function getUsedLetters(state) {
  const used = new Set();
  for (const h of state.history) {
    for (const c of h.guess.toUpperCase()) used.add(c);
  }
  return used;
}

function countNewLetters(word, usedLetters) {
  let c = 0;
  for (const ch of new Set(word.toUpperCase())) {
    if (!usedLetters.has(ch)) c++;
  }
  return c;
}

/* ===============================
   SETTER LOGIC
   =============================== */

function computeRemainingForSecret(state, secret, secrets) {
  const guess = state.pendingGuess;
  if (!guess || guess.includes("?")) return null;

  const fb = scoreGuess(secret.toUpperCase(), guess.toUpperCase());
  const newHistory = [...state.history,{ guess, fb, ignoreConstraints: false }];
  let count = 0;
  for (const w of secrets) {
    if (isConsistentWithHistory(newHistory, w, state)) {
      count++;
    }
  }
  return count;
}

function countColors(secret, guess) {
  const fb = scoreGuess(secret.toUpperCase(), guess.toUpperCase());
  let score = 0;

  for (const c of fb) {
    if (c === "🟨") score += 0.5;
    else if (c === "⬛") score += 1;
    // 🟩 contributes 0
  }

  return score;
}

function pickAISecret(
  state,
  secretRows,
  {
    maxSecretChanges,
    maxSecretsEvaluated,
    randomness, 
    pOverlap ,
    pReductionGivenNoOverlap 
  }
) {
  state.aiSecretChangeCount ??= 0;

  // ---------- Early exits ----------
  if (!state.history || state.history.length === 0) {
    return weightedRandom(secretRows, r => r.probability || 1).word;
  }

  if (state.aiSecretChangeCount >= maxSecretChanges) {
    return state.secret;
  }

  // ---------- Noise ----------
  if (Math.random() < randomness) {
    return state.secret;
  }

  const allSecrets = secretRows.map(r => r.word);

  const feasibleSecrets = allSecrets.filter(secret =>
    isConsistentWithHistory(state.history, secret, state)
  );

  if (!feasibleSecrets.length) return state.secret;

  const currentRemaining =
    computeRemainingForSecret(state, state.secret, allSecrets);

  if (!currentRemaining || currentRemaining === 0) {
    return state.secret;
  }

  // ---------- Path 1: reduction ----------
  const reductionCandidates = feasibleSecrets
    .slice(0, maxSecretsEvaluated)
    .map(secret => {
      const remaining =
        computeRemainingForSecret(state, secret, allSecrets);
      if (remaining === null) return null;
      return {
        secret,
        reduction: (currentRemaining - remaining) / currentRemaining
      };
    })
    .filter(Boolean);

  if (!reductionCandidates.length) return state.secret;

  const reductionChoice = weightedRandom(
    reductionCandidates,
    c => c.reduction
  );

  // ---------- Path 2 & 3: color-adversarial ----------
  const guess = state.pendingGuess;

  if (guess && !guess.includes("?")) {
    // score current secret
    let currentColorScore = 0;
    for (const c of scoreGuess(
      state.secret.toUpperCase(),
      guess.toUpperCase()
    )) {
      if (c === "🟨") currentColorScore += 0.5;
      else if (c === "⬛") currentColorScore += 1;
    }

    // score feasible secrets
    const colorCandidates = feasibleSecrets
      .map(secret => {
        let score = 0;
        for (const c of scoreGuess(
          secret.toUpperCase(),
          guess.toUpperCase()
        )) {
          if (c === "🟨") score += 0.5;
          else if (c === "⬛") score += 1;
        }
        return {
          secret,
          score,
          delta: score - currentColorScore
        };
      })
      .filter(x => x.delta > 0);

    if (colorCandidates.length) {
      const overlapCandidates = colorCandidates.filter(
        x => x.secret === reductionChoice.secret
      );

      const bestOverlap =
        overlapCandidates.length
          ? overlapCandidates.reduce((a, b) =>
              b.score > a.score ? b : a
            )
          : null;

      state.aiSecretChangeCount++;

      // ---------- Decision ----------
      if (bestOverlap && Math.random() < pOverlap) {
        return bestOverlap.secret; // Path 3
      }

      if (Math.random() < pReductionGivenNoOverlap) {
        return reductionChoice.secret; // Path 1
      }

      // Path 2: weighted by improvement
      const totalDelta = colorCandidates.reduce(
        (s, x) => s + x.delta,
        0
      );

      let r = Math.random() * totalDelta;
      for (const x of colorCandidates) {
        r -= x.delta;
        if (r <= 0) return x.secret;
      }

      return colorCandidates[0].secret;
    }
  }

  // ---------- Fallback ----------
  state.aiSecretChangeCount++;
  return reductionChoice.secret;
}



/* ===============================
   SOLVER LOGIC
   =============================== */

function pickAIGuess(state, wordRows, strategyWeights) {
  if (!state || !state.history) {
    return weightedRandom(wordRows, r => r.probability || 1).word;
  }

  const history = state.history;
  const usedGuesses = new Set(history.map(h => h.guess.toUpperCase()));
  const usedLetters = getUsedLetters(state);

  const remaining = wordRows.filter(r => !usedGuesses.has(r.word));
  if (!remaining.length) {
    return weightedRandom(wordRows, r => r.probability || 1).word;
  }

  // ----- Force guess power -----
  const forceOptions = state?.powers?.forceGuessOptions;
  if (forceOptions?.length) {
    let forced = remaining.filter(r =>
      forceOptions.some(opt => satisfiesForceGuess(r.word, opt))
    );
    if (!forced.length) forced = wordRows;
    return weightedRandom(forced, r => r.probability || 1).word;
  }

  // ----- Strategy pools -----
  const feasible = remaining.filter(r =>
    isConsistentWithHistory(history, r.word, state)
  );

  const uninformed = remaining.filter(r =>
    countNewLetters(r.word, usedLetters) >= 1
  );

  const optimal = (() => {
    if (!feasible.length) return [];
    const maxNew = Math.max(
      ...feasible.map(r => countNewLetters(r.word, usedLetters))
    );
    return feasible.filter(
      r => countNewLetters(r.word, usedLetters) === maxNew
    );
  })();

  const optimal2 = (() => {
    // Case 1: many feasible → pure information gain (5 unused letters)
    if (feasible.length > 10) {
      const allFiveNew = remaining.filter(
        r => countNewLetters(r.word, usedLetters) === 5
      );
      return allFiveNew;
    }

    // Case 2: few feasible → restrict to feasible and maximize unused letters
    if (!feasible.length) return [];
    const maxNew = Math.max(
      ...feasible.map(r => countNewLetters(r.word, usedLetters))
    );
    return feasible.filter(
      r => countNewLetters(r.word, usedLetters) === maxNew
    );
  })();

  const pools = {
    uninformed,
    feasible,
    optimal,
    optimal2
  };

  // Remove empty strategies
  const availableWeights = {};
  for (const [k, w] of Object.entries(strategyWeights)) {
    if (pools[k]?.length) availableWeights[k] = w;
  }

  const strategy = weightedChoice(availableWeights);
  const pool = pools[strategy];

  return pool[Math.floor(Math.random() * pool.length)].word;
}


/* ===============================
   EXPORT
   =============================== */

module.exports = { createAI };
