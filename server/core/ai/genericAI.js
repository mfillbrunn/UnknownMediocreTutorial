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
  const newHistory = [
    ...state.history,
    { guess, fb, ignoreConstraints: false }
  ];

  let count = 0;
  for (const w of secrets) {
    if (isConsistentWithHistory(newHistory, w, state)) {
      count++;
    }
  }
  return count;
}

function pickAISecret(state, secretRows, {
  maxSecretChanges,
  maxSecretsEvaluated,
  minReductionThreshold,
  randomness
}) {
  state.aiSecretChangeCount ??= 0;

  if (!state.history || state.history.length === 0) {
    return weightedRandom(secretRows, r => r.probability || 1).word;
  }

  if (state.aiSecretChangeCount >= maxSecretChanges) {
    return state.secret;
  }

  const secrets = secretRows.map(r => r.word);
  const feasible = secrets.filter(w =>
    isConsistentWithHistory(state.history, w, state)
  );

  if (!feasible.length) return state.secret;

  const before = computeRemainingForSecret(state, state.secret, secrets);
  if (!before || before === 0) return state.secret;

  const candidates = feasible
    .slice(0, maxSecretsEvaluated)
    .map(secret => {
      const after = computeRemainingForSecret(state, secret, secrets);
      if (after === null) return null;
      return {
        secret,
        reduction: (before - after) / before
      };
    })
    .filter(c => c && c.reduction >= minReductionThreshold);

  if (!candidates.length) return state.secret;

  const chosen =
    Math.random() < randomness
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : weightedRandom(candidates, c => c.reduction);

  state.aiSecretChangeCount++;
  return chosen.secret;
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

  const pools = {
    uninformed,
    feasible,
    optimal
  };

  // Remove empty strategies
  const availableWeights = {};
  for (const [k, w] of Object.entries(strategyWeights)) {
    if (pools[k].length) availableWeights[k] = w;
  }

  const strategy = weightedChoice(availableWeights);
  const pool = pools[strategy];

  return pool[Math.floor(Math.random() * pool.length)].word;
}

/* ===============================
   EXPORT
   =============================== */

module.exports = { createAI };
