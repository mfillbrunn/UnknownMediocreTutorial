// /powers/powers/freezeSecretServer.js
const engine = require("../powerEngineServer.js");

console.log("Freeze Secret power loaded");
engine.registerPower("freezeSecret", {
  apply(state, action, roomId, io) {
    if (state.powers.freezeSecretUsed) return;
    if (!state.firstSecretSet) return;

    state.powers.freezeSecretUsed = true;
    state.powers.freezeActive = true;

    io.to(roomId).emit("powerUsed", { type: "freezeSecret" });
  },

  // NEW: block actions here
    beforeSetterSecretChange(state, action) {
    if (!state.powers.freezeActive) return false;

    // Block only NEW secret while frozen; SAME is allowed
    if (action.type === "SET_SECRET_NEW") {
      return true; // block
    }

    return false;  // allow SET_SECRET_SAME etc.
  },


  postScore(state, entry) {
    if (state.powers.freezeActive) {
      entry.freezeApplied = true;
      entry.powerUsed = "FreezeSecret";
    }
  },

  turnStart(state, role) {
    if (state.phase === "normal" && role === state.setter && !state.pendingGuess) {
    state.powers.freezeActive = false;
  }
  }
});
