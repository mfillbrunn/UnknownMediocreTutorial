const engine = require("../powerEngineServer.js");
const { endGame, pushWinEntry } = require("../../core/phases/normal");

engine.registerPower("assassinWord", {
  apply(state, action, roomId, io) {
    if (state.powers.assassinWordUsed) return;
    if (!action.word) return;

    const w = action.word.toUpperCase();
    if (w === state.secret.toUpperCase()) return;
    if (state.pendingGuess && w === state.pendingGuess.toUpperCase()) return;

    state.powers.assassinWordUsed = true;
    state.powerUsedThisTurn = true;
    state.powers.assassinWord = w;
  },

  postScore(state, entry, roomId, io) {
    const w = state.powers.assassinWord;
    if (!w) return;

    if (state.pendingGuess.toUpperCase() === w) {
      entry.assassinTriggered = true;
      entry.fb = ["💀","💀","💀","💀","💀"];
      entry.fbGuesser = ["💀","💀","💀","💀","💀"];

      state.currentSecret = state.secret;
      pushWinEntry(state, state.secret);

      // Only pass what the power should control
      endGame(state, roomId, io);
    }
  }
});
