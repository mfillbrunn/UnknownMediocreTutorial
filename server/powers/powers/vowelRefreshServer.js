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

