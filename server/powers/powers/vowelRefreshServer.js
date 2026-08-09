const engine = require("../powerEngineServer.js");
const {isConsistentWithHistory} = require("../../game-engine/history");
const {
  hasLetterKnowledge,
  eraseLetterKnowledge
} = require("../../utils/resetLetterKnowledge");

engine.registerPower("vowelRefresh", {
  apply(state, action, roomId, io) {
    if (state.powers.vowelRefreshUsed) return false;

    const lastEntry = state.history[state.history.length - 1];
    if (!lastEntry) return false;

    const vowels = new Set(["A", "E", "I", "O", "U"]);
    const lastGuess = String(lastEntry.guess || "").toUpperCase();
    const resetVowels = new Set();

    for (const letter of lastGuess) {
      if (vowels.has(letter)) {
        resetVowels.add(letter);
      }
    }

    if (!resetVowels.size) return false;

    state.powers.vowelRefreshUsed = true;
    state.powers.vowelRefreshActive = true;

    eraseLetterKnowledge(state, resetVowels);

    if (state.powers?.rouletteSecretActive) {
      state.powers.rouletteSecretFeasible = global.ALLOWED_SECRETS.filter(
        secret => isConsistentWithHistory(state.history, secret, state)
      );
    }

    io.to(roomId).emit("vowelRefreshInfo", {
      vowels: [...resetVowels]
    });

    io.to(roomId).emit("powerUsed", {
      type: "vowelRefresh"
    });

    return true;
  },

  postScore() {},
  turnStart() {}
});