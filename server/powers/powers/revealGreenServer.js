// /powers/powers/revealGreenServer.js
const engine = require("../powerEngineServer");

engine.registerPower("revealgreen", {
  apply(state, action, roomId, io) {
    if (state.powers.revealGreenUsed) return;
    if (!state.secret) return;

    const pos = Math.floor(Math.random() * 5);
    const letter = state.secret[pos].toUpperCase();

    state.powers.revealGreenUsed = true;
    state.powers.revealGreenPos = pos;
    state.powers.revealGreenLetter = letter;

    io.to(roomId).emit("powerUsed", { type: "revealGreen", pos, letter });
  },

  postScore(state, entry) {
    if (state.powers.revealGreenPos !== null) {
      entry.revealGreen = {
        pos: state.powers.revealGreenPos,
        letter: state.powers.revealGreenLetter
      };
    }

    // one-shot
    state.powers.revealGreenPos = null;
    state.powers.revealGreenLetter = null;
  }
});
