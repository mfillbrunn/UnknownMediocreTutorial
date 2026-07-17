// powers/powers/wiretapServer.js
//
// Wiretap is passive by default (the always-on remaining-secrets count is
// built in safeState). This file adds its ACTIVE ability: once per round,
// in bullet/blitz games only, the guesser can "tap the line" so the
// remaining count updates live as they draft a guess (see the
// guesserWiretapDraft socket handler). Activating just flips the flags;
// the live numbers are computed and pushed privately as the guesser types.

const engine = require("../powerEngineServer");

// Only short-clock games get the live tap. Longer games (deep / no-time)
// would let the guesser probe the count indefinitely, so it's disabled.
function wiretapActiveAllowed(state) {
  return state.rankMode === "bullet" || state.rankMode === "blitz";
}

engine.registerPower("wiretap", {
  apply(state, action, roomId, io) {
    if (state.powers.wiretapUsed) return false;
    if (state.turn !== state.guesser) return false;
    if (!wiretapActiveAllowed(state)) return false;

    state.powers.wiretapUsed = true;
    state.powers.wiretapActive = true;

    io.to(roomId).emit("powerUsed", { type: "wiretap" });
  }
});

module.exports = { wiretapActiveAllowed };
