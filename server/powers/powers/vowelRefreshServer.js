const engine = require("../powerEngineServer.js");
const {isConsistentWithHistory} = require("../../game-engine/history");

engine.registerPower("vowelRefresh", {
  apply(state, action, roomId, io) {
    if (state.powers.vowelRefreshUsed) return false;
    state.powers.vowelRefreshUsed = true;
    state.powers.vowelRefreshActive = true;

    const lastIndex = state.history.length - 1;
    const entry = state.history[lastIndex];
    if (!entry) return false;

    const vowels = new Set(["A", "E", "I", "O", "U"]);
    const guess = entry.guess.toUpperCase();
    const resetVowels = new Set();
    // Positions this power actually cleared -- lets the client render those
    // tiles as "reset to unknown" (distinct from Hide Evidence's "redacted"
    // look), even though both end up as an empty "" feedback.
    const resetIndices = [];

    // Rewrite feedback for the last round -- every vowel in it gets reset,
    // regardless of whether an earlier guess already confirmed that letter
    // (clearing feedback only erases info the Inspector was shown, it can't
    // create a contradiction, so there's no reason to hold back on repeats).
    for (let i = 0; i < 5; i++) {
      const letter = guess[i];
      if (!vowels.has(letter)) continue;

      resetVowels.add(letter);
      resetIndices.push(i);
      if (Array.isArray(entry.fb)) {
        entry.fb[i] = "";
      }
      if (Array.isArray(entry.fbGuesser)) {
        entry.fbGuesser[i] = "";
      }
    }
    if (resetIndices.length) entry.vowelRefreshCleared = resetIndices;
    if (state.powers?.rouletteSecretActive){
    state.powers.rouletteSecretFeasible = global.ALLOWED_SECRETS.filter(secret =>
      isConsistentWithHistory(state.history, secret, state)
    );
    }
    // Emit UI-only info to both players
    io.to(roomId).emit("vowelRefreshInfo", {
      vowels: Array.from(resetVowels)
    });
    io.to(roomId).emit("powerUsed", { type: "vowelRefresh" });
  },

  postScore() {},
  turnStart() {}
});

