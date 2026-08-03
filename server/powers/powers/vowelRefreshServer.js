const engine = require("../powerEngineServer.js");
const {isConsistentWithHistory} = require("../../game-engine/history");

engine.registerPower("vowelRefresh", {
  apply(state, action, roomId, io) {
    if (state.powers.vowelRefreshUsed) return false;
    state.powers.vowelRefreshUsed = true;
    state.powers.vowelRefreshActive = true;

    const lastIndex = state.history.length - 1;
    const lastEntry = state.history[lastIndex];
    if (!lastEntry) return false;

    const vowels = new Set(["A", "E", "I", "O", "U"]);
    const lastGuess = lastEntry.guess.toUpperCase();
    const resetVowels = new Set();

    // Which vowels are eligible is still decided from the LAST guess only
    // (matches the client's preview in powerEngine/powers/vowelRefresh.js),
    // but once a vowel is picked, this needs to erase every trace of it --
    // every earlier guess row that also touched that vowel was leaking the
    // exact same info right back, so scrubbing only the newest row left the
    // "reset" mostly cosmetic.
    for (let i = 0; i < 5; i++) {
      const letter = lastGuess[i];
      if (vowels.has(letter)) resetVowels.add(letter);
    }

    // Rewrite feedback for EVERY round so far -- every occurrence of a
    // reset vowel gets cleared, regardless of which guess it was in
    // (clearing feedback only erases info the Inspector was shown, it
    // can't create a contradiction, so there's no reason to hold back on
    // repeats or on earlier rows).
    for (const entry of state.history) {
      const guess = entry.guess.toUpperCase();
      const resetIndices = [];
      for (let i = 0; i < 5; i++) {
        if (!resetVowels.has(guess[i])) continue;
        resetIndices.push(i);
        if (Array.isArray(entry.fb)) entry.fb[i] = "";
        if (Array.isArray(entry.fbGuesser)) entry.fbGuesser[i] = "";
      }
      if (resetIndices.length) {
        entry.vowelRefreshCleared = Array.from(
          new Set([...(entry.vowelRefreshCleared || []), ...resetIndices])
        );
      }
    }
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

