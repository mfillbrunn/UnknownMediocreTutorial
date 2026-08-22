const engine = require("../powerEngineServer.js");
const {isConsistentWithHistory} = require("../../game-engine/history");
const {
  hasLetterKnowledge,
  eraseLetterKnowledge
} = require("../../utils/resetLetterKnowledge");

engine.registerPower("vowelRefresh", {
  apply(state, action, roomId, io) {
    if (state.powers.vowelRefreshUsed) return false;
    if (!state.history?.length) return false;

    // All 5 vowels, every time -- not just whichever happened to appear in
    // the most recent guess. eraseLetterKnowledge already scans the WHOLE
    // history (every past guess's feedback, plus extraConstraints) for the
    // given letters, so this wipes every vowel's accumulated info from the
    // entire match, not just this one guess.
    const resetVowels = new Set(["A", "E", "I", "O", "U"]);

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