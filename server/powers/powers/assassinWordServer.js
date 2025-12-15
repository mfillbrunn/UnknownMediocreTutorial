// /powers/powers/assassinWordServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("assassinWord", {
  apply(state, action) {
      if (state.powers.assassinWordUsed) return;   // prevent reuse
    state.powers.assassinWordUsed = true;        // mark USED
    state.powerUsedThisTurn = true;
    if (!action.word) return;
    const w = action.word.toUpperCase();
    if (w === state.secret.toUpperCase()) return;
    if (state.pendingGuess && w === state.pendingGuess.toUpperCase()) return;
    state.powers.assassinWord = w;
  },

  postScore(state, entry) {
    const w = state.powers.assassinWord;
    if (!w) return;

    if (state.pendingGuess.toUpperCase() === w) {
      entry.assassinTriggered = true;
      const { endGame } = require("../../core/phases/normal"); // adjust path
endGame(state, roomId, room, io);
    }
  }
});
