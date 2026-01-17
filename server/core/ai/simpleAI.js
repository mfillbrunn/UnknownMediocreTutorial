// core/ai/simpleAI.js
const { isConsistentWithHistory } = require("../../game-engine/history");

const INFO_MIN_NEW_LETTERS = 3;

//MAIN functions to pick guess and secret
function pickGuess(state, allowedGuesses) {
  return pickAIGuess(state, allowedGuesses);
}

function pickSecret(allowedGuesses) {
  return allowedGuesses[Math.floor(Math.random() * allowedGuesses.length)];
}

//HELPER functions

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice(weights) {
  const r = Math.random();
  let acc = 0;
  for (const [key, w] of Object.entries(weights)) {
    acc += w;
    if (r <= acc) return key;
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

function pickAIGuess(state, allWords) {
  if (!state || !state.history) {
    return randomChoice(allWords);
  }
  const history = state.history || [];
  const usedGuesses = new Set(history.map(h => h.guess.toUpperCase()));
  const usedLetters = getUsedLetters(state);

  // Filter out already-guessed words
  const remainingWords = allWords.filter(
    w => !usedGuesses.has(w.toUpperCase())
  );

  if (remainingWords.length === 0) {
    return randomChoice(allWords);
  }

  // 1️⃣ Feasible words
  const feasibleWords = remainingWords.filter(w =>
    isConsistentWithHistory(history, w, state)
  );

  // 2️⃣ Info-seeking words (≥ N new letters)
  const infoWords = remainingWords.filter(w =>
    countNewLetters(w, usedLetters) >= INFO_MIN_NEW_LETTERS
  );

  // Decide strategy
  const probs = getAIGuessProbs(state);
  let strategy = weightedChoice(probs);

  // Fallbacks (important)
  if (strategy === "feasible" && feasibleWords.length === 0) {
    strategy = "info";
  }
  if (strategy === "info" && infoWords.length === 0) {
    strategy = "random";
  }

  // Execute strategy
  switch (strategy) {
    case "feasible":
      return randomChoice(feasibleWords);

    case "info":
      return randomChoice(infoWords);

    case "random":
    default:
      return randomChoice(remainingWords);
  }
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
module.exports = { pickGuess, pickSecret };
