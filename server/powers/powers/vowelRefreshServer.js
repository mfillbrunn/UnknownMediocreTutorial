const engine = require("../powerEngineServer.js");

engine.registerPower("vowelRefresh", {
  apply(state) {
    if (state.powers.vowelRefreshUsed) return;
    state.powers.vowelRefreshUsed = true;
    state.powerUsedThisTurn = true;

    const lastIndex = state.history.length - 1;
    const last = state.history[lastIndex];
    if (!last) return;

    const vowels = new Set(["A","E","I","O","U"]);
    const guess = last.guess.toUpperCase();

    // Identify which positions must be "erased" logically.
    const indices = [];
    for (let i = 0; i < 5; i++) {
      if (vowels.has(guess[i])) indices.push(i);
    }

    state.powers.vowelRefreshEffect = {
      guessIndex: lastIndex,
      indices    // positions of vowels in that guess
    };
  },

  postScore() {}, // NO CHANGE TO FEEDBACK

  turnStart(state, role) {
    if (role !== state.guesser) return;
    // Optional cleanup between rounds if needed:
    // state.powers.vowelRefreshEffect = null;
  }
});

