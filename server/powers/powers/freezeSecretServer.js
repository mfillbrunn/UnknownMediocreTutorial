// /powers/powers/freezeSecretServer.js
const engine = require("../powerEngineServer.js");
const spyChargeServer = require("./spyChargeServer");

engine.registerPower("freezeSecret", {
  apply(state, action, roomId, io, room) {
    if (state.powers.freezeSecretUsed) return false;

    state.powers.freezeSecretUsed = true;
    state.powers.freezeActive = true;
    io.to(roomId).emit("toast", "Secret is frozen for a turn!");
    io.to(roomId).emit("powerUsed", { type: "freezeSecret" });

    // A small consolation for the Secretkeeper: being frozen costs them their
    // Keep/New choice for a turn, so award the same 1-star floor a
    // normal eligible decision would have earned -- same commitAward
    // path spyChargeServer's own decision-turn awards go through
    // (Power Choice mode has this monkey-patched to also queue its
    // reward-choice milestones, so a freeze that pushes the Secretkeeper across
    // 5/9/15 opens a reward choice exactly like any other star would).
    spyChargeServer.commitAward(state, { baseStars: 1, bonusStars: 0 }, room, io);
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
