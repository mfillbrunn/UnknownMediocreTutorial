// /powers/powers/freezeSecretServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("freezeSecret", {
  apply(state, action, roomId, io, room) {
    if (state.powers.freezeSecretUsed) return false;

    state.powers.freezeSecretUsed = true;
    state.powers.freezeActive = true;
    io.to(roomId).emit("toast", "Secret is frozen for a turn!");
    io.to(roomId).emit("powerUsed", { type: "freezeSecret" });

    // Do not award a star here. The star is awarded only if and when the
    // setter commits the frozen Keep -- see normal.js's setter submission
    // handler, which awards a flat one star for an accepted Keep while
    // freezeActive is still true (read before postScore below clears it).
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
