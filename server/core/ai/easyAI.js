// core/ai/easyAI.js
function pickGuess(state, allowedGuesses) {
  const used = new Set(state.history.map(h => h.guess));
  const candidates = allowedGuesses.filter(g => !used.has(g));
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickSecret(allowedGuesses) {
  return allowedGuesses[Math.floor(Math.random() * allowedGuesses.length)];
}

module.exports = { pickGuess, pickSecret };
