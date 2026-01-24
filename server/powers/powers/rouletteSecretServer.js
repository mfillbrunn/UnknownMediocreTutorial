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

    io.to(roomId).emit("powerUsed", { type: "rouletteSecret" });
  },

  // ----------------------------------
  // Setter's turn begins → lock roulette
  // ----------------------------------
  turnStart(state, role, roomId, io) {
    if (
      role !== state.setter ||
      !state.powers.rouletteSecretActive ||
      state.powers.rouletteSecretFeasible
    ) {
      return;
    }

    const feasibleSecrets = ALLOWED_SECRETS.filter(secret =>
      isConsistentWithHistory(state.history, secret, state)
    );

    state.powers.rouletteSecretFeasible =
      feasibleSecrets.length > 0
        ? feasibleSecrets
        : ALLOWED_SECRETS.slice();

    io.to(roomId).emit("rouletteSecretStart", {
      feasible: state.powers.rouletteSecretFeasible
    });
  },

  // ----------------------------------
  // Setter submits → freeze roulette
  // ----------------------------------
  beforeSetterSecretChange(state, action) {
    if (!state.powers.rouletteSecretActive) return false;

    // Force the secret to whatever the client submitted at click-time
    state.secret = action.secret;

    // Cleanup
    state.powers.rouletteSecretActive = false;
    state.powers.rouletteSecretFeasible = null;

    return true; // block normal secret handling
  }
});
