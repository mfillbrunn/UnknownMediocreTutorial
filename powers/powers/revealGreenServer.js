// /powers/powers/revealGreenServer.js
// Server-side logic for Reveal Green power (guesser ability)

const engine = require("../powerEngineServer");

engine.registerPower("revealgreen", {
  apply(state, action, roomId, io) {
    // Only once per match
    if (state.powers.revealGreenUsed) return;

    // Must have an initial secret set
    if (!state.secret) return;

    // Pick a random position
    const pos = Math.floor(Math.random() * 5);
    const letter = state.secret[pos].toUpperCase();

    // Activate effect
    state.powers.revealGreenUsed = true;
    state.powers.revealGreenPos = pos;
    state.powers.revealGreenLetter = letter;

    // Notify clients
    io.to(roomId).emit("powerUsed", {
      type: "revealGreen",
      pos,
      letter
    });
  }
});
