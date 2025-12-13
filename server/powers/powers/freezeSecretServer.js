// /powers/powers/freezeSecretServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("freezeSecret", {
  apply(state, action, roomId, io) {
    if (state.powers.freezeSecretUsed) return;
    if (!state.firstSecretSet) return;   // only after at least one secret

    state.powers.freezeSecretUsed = true;
    state.powers.freezeActive = true;

    io.to(roomId).emit("powerUsed", { type: "freezeSecret" });
  },

  // Block only NEW secret while frozen; SAME is allowed
  beforeSetterSecretChange(state, action) {
    if (!state.powers.freezeActive) return false;

    if (action.type === "SET_SECRET_NEW") {
      return true;               // block NEW while frozen
    }
    return false;                // allow SAME, etc.
  },

  postScore(state, entry) {
    if (state.powers.freezeActive) {
      entry.freezeApplied = true;
      entry.powerUsed = "FreezeSecret";

      // ❗ Freeze is consumed AFTER this decision’s scoring
      state.powers.freezeActive = false;
    }
  }

  // NOTE: no turnStart hook needed – freeze ends in postScore.
});
