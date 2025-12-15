const engine = require("../powerEngineServer.js");
const { endGame, pushWinEntry } = require("../../core/phases/normal");


engine.registerPower("assassinWord", {
  apply(state, action, roomId, io) {
    if (state.powers.assassinWordUsed) return;
    if (!action.word) return;

    const w = action.word.toUpperCase();
    if (w === state.secret.toUpperCase()) return;

    state.powers.assassinWordUsed = true;
    state.powers.assassinWord = w;
  }
});
