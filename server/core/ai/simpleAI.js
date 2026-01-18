// core/ai/simpleAI.js
const { isConsistentWithHistory } = require("../../game-engine/history");

const INFO_MIN_NEW_LETTERS = 3;

//MAIN functions to pick guess and secret
function pickGuess(state, allowedGuesses) {
  return pickAIGuess(state, allowedGuesses);
}

function pickSecretFromList(secretRows) {
  const candidates = secretRows.filter(r => r.probability > 0);
  const chosen = weightedRandom(
    candidates.length ? candidates : secretRows,
    r => r.probability || 1
  );

  return chosen.word;
}

//HELPER functions
function weightedRandom(items, weightFn) {
  const total = items.reduce((s, x) => s + weightFn(x), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (const item of items) {
    r -= weightFn(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
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

function pickAIGuess(state, wordRows) {
  const allWords = wordRows.map(r => r.word);
  if (!state || !state.history) {
    return weightedRandom(wordRows, r => r.probability || 1).word;
  }
  const history = state.history || [];
  const usedGuesses = new Set(history.map(h => h.guess.toUpperCase()));
  const usedLetters = getUsedLetters(state);
  const remaining = wordRows.filter(
    r => !usedGuesses.has(r.word)
  );
  if (!remaining.length) {
    return weightedRandom(wordRows, r => r.probability || 1).word;
  }
  const feasible = remaining.filter(r =>
    isConsistentWithHistory(history, r.word, state)
  );
  const info = remaining.filter(r =>
    countNewLetters(r.word, usedLetters) >= INFO_MIN_NEW_LETTERS
  );
  let strategy = weightedChoice(getAIGuessProbs(state));
  if (strategy === "feasible" && !feasible.length) strategy = "info";
  if (strategy === "info" && !info.length) strategy = "random";
  const pool =
    strategy === "feasible" ? feasible :
    strategy === "info" ? info :
    remaining;
  return weightedRandom(pool, r => r.probability || 1).word;
}

function getAIGuessProbs(state) {
  const feasible = Math.min(1, 0.4 + state.history.length * 0.15);
  const remaining = 1 - feasible;
  return {
    feasible,
    info: remaining * 0.6,
    random: remaining * 0.4
  };
}
module.exports = { pickGuess, pickSecretFromList };
