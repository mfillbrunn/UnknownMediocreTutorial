const engine = require("../powerEngineServer");

engine.registerPower("revealGreen", {
  apply(state, action, roomId, io) {
    if (state.powers.revealGreenUsed) return;
    if (!state.secret) return;

    const pos = Math.floor(Math.random() * 5);
    const letter = state.secret[pos].toUpperCase();

    state.powers.revealGreenUsed = true;
    state.revealGreenInfo = { pos, letter };

    io.to(roomId).emit("powerUsed", {
      type: "revealGreen",
      pos,
      letter
    });
  }
});
