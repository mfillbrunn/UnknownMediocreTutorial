const engine = require("../powerEngineServer.js");

engine.registerPower("vowelRefresh", {
  apply(state) {
    if (state.powers.vowelRefreshUsed) return;
    state.powers.vowelRefreshUsed = true;
    state.powerUsedThisTurn = true;

    const lastIndex = state.history.length - 1;
    const last = state.history[lastIndex];
    if (!last) return;

    const vowels = new Set(["A","E","I","O","U"]);  // Y is NOT a vowel
    const guess = last.guess.toUpperCase();

    // Find vowel positions in last guess
    const indices = [];
    for (let i = 0; i < 5; i++) {
      if (vowels.has(guess[i])) {
        indices.push(i);
      }
    }

    // Store vowel refresh effect (does NOT mutate feedback)
    state.powers.vowelRefreshEffect = {
      guessIndex: lastIndex,
      indices     // positions whose constraints are erased
    };
  },

  postScore() {
    // Do NOT change feedback tiles
    return;
  },

  turnStart(state, role) {
    // Optional cleanup logic if needed later
  }
});
