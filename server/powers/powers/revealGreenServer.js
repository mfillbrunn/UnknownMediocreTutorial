// /powers/powers/revealGreenServer.js
const engine = require("../powerEngineServer.js");

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

    // Attach to history entry
    entry.revealGreen = {
      pos: state.powers.revealGreenPos,
      letter: state.powers.revealGreenLetter
    };

    // Mark that the power was used
    entry.powerUsed = "RevealGreen";

    // Expose to client (so UI can update patterns)
    state.revealGreenInfo = {
      pos: state.powers.revealGreenPos,
      letter: state.powers.revealGreenLetter
    };
  }

  // One-shot reset of power state
  state.powers.revealGreenPos = null;
  state.powers.revealGreenLetter = null;
}


});
