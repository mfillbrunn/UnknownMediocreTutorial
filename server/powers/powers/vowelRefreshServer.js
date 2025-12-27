const engine = require("../powerEngineServer.js");

engine.registerPower("vowelRefresh", {
  apply(state) {
    if (state.powers.vowelRefreshUsed) return;
    state.powers.vowelRefreshUsed = true;
    state.powerUsedThisTurn = true;

    const lastIndex = state.history.length - 1;
    const entry = state.history[lastIndex];
    if (!entry) return;

    const vowels = new Set(["A", "E", "I", "O", "U"]);
    const guess = entry.guess.toUpperCase();

    // Collect letters known to be present BEFORE this round
    const knownPresent = new Set();

    for (let r = 0; r < lastIndex; r++) {
      const h = state.history[r];
      const fb = h.fb ?? h.fbGuesser;
      if (!Array.isArray(fb)) continue;

      const g = h.guess.toUpperCase();
      for (let i = 0; i < 5; i++) {
        if (fb[i] === "🟩" || fb[i] === "🟨") {
          knownPresent.add(g[i]);
        }
      }
    }

    // Rewrite feedback for the last round
    for (let i = 0; i < 5; i++) {
      const letter = guess[i];
      if (!vowels.has(letter)) continue;

      // Do NOT erase if this vowel was previously confirmed
      if (knownPresent.has(letter)) continue;

      if (Array.isArray(entry.fb)) {
        entry.fb[i] = "⬛";
      }
      if (Array.isArray(entry.fbGuesser)) {
        entry.fbGuesser[i] = "⬛";
      }
    }
  },

  postScore() {},
  turnStart() {}
});

