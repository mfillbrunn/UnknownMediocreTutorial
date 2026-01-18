// core/ai/level2AI.js
const { isConsistentWithHistory } = require("../../game-engine/history");
const { satisfiesForceGuess } = require("../../game-engine/validation");

const INFO_MIN_NEW_LETTERS = 3;

//MAIN functions to pick guess and secret
function pickGuess(state, allowedGuesses) {
  return pickAIGuess(state, allowedGuesses);
}

function pickSecret(secretRows) {
  const candidates = secretRows.filter(r => r.probability > 0);
  const chosen = weightedRandom(
    candidates.length ? candidates : secretRows,
    r => r.probability || 1
  );

  return chosen.word;
}

//HELPER functions

function satisfiesAnyForceGuess(word, options = []) {
  if (!options || options.length === 0) return true;
  return options.some(opt => satisfiesForceGuess(word, opt));
}

function weightedRandom(items, weightFn) {
  if (!items || items.length === 0) return null;

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

function pickAIGuess(state, wordRows) {
  const allWords = wordRows.map(r => r.word);
  if (!state || !state.history) {
    return weightedRandom(wordRows, r => r.probability || 1).word;
  }
  const history = state.history || [];
  const usedGuesses = new Set(history.map(h => h.guess.toUpperCase()));
  const usedLetters = getUsedLetters(state);
  const remaining = wordRows.filter(r => !usedGuesses.has(r.word));
  if (!remaining.length) {return weightedRandom(wordRows, r => r.probability || 1).word;}
  const feasible = remaining.filter(r =>isConsistentWithHistory(history, r.word, state));
  const info = remaining.filter(r =>countNewLetters(r.word, usedLetters) >= INFO_MIN_NEW_LETTERS);
  const forceOptions = state?.powers?.forceGuessOptions;
  if (forceOptions && forceOptions.length > 0) {
    let forced = remaining.filter(r =>satisfiesAnyForceGuess(r.word, forceOptions));  
    if (forced.length === 0) {forced = wordRows.filter(r =>satisfiesAnyForceGuess(r.word, forceOptions));}
    const choice = weightedRandom(forced, r => r.probability || 1);
    return choice?.word ?? null;
  } else{
    let strategy = weightedChoice(getAIGuessProbs(state));
    if (strategy === "feasible" && !feasible.length) strategy = "info";
    if (strategy === "info" && !info.length) strategy = "random";
    const pool =
      strategy === "feasible" ? feasible :
      strategy === "info" ? info :
      remaining;
    return weightedRandom(pool, r => r.probability || 1).word;
  }
}

function getAIGuessProbs(state) {
  const feasible = Math.min(1, 0.3 + state.history.length * 0.15);
  const remaining = 1 - feasible;
  return {
    feasible,
    info: remaining * 0.6,
    random: remaining * 0.4
  };
}
module.exports = { pickGuess, pickSecret};
