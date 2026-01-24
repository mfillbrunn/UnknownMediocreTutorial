// /powers/powers/rouletteSecretServer.js
const engine = require("../powerEngineServer.js");
const { isConsistentWithHistory } = require("../../game-engine/validation");

// IMPORTANT:
// ALLOWED_SECRETS must be reachable here.
// If not global yet, see note below.
const { ALLOWED_SECRETS } = global;

engine.registerPower("rouletteSecret", {
  // ----------------------------------
  // Guesser uses the power
  // ----------------------------------
  apply(state, action, roomId, io) {
    if (state.powers.rouletteSecretUsed) return;
    state.powers.rouletteSecretUsed = true;
    state.powers.rouletteSecretActive = true;
    state.powers.rouletteSecretFeasible = ALLOWED_SECRETS.filter(secret =>
      isConsistentWithHistory(state.history, secret, state)
    );
    io.to(roomId).emit("powerUsed", { type: "rouletteSecret" });
  }
});
