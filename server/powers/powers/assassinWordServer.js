// /powers/powers/assassinWordServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("assassinWord", {
  apply(state, action) {
    if (!action.word) return;
    const w = action.word.toUpperCase();
    if (w === state.secret.toUpperCase()) return;
    state.powers.assassinWord = w;
  },

  postScore(state, entry) {
    const w = state.powers.assassinWord;
    if (!w) return;

    if (state.pendingGuess.toUpperCase() === w) {
      entry.assassinTriggered = true;
      state.gameOver = true;
      state.endRound = Math.max(7, state.roundIndex + 2);
    }
  }
});
