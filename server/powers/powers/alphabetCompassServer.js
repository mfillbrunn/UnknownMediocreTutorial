// /powers/powers/alphabetCompassServer.js — Alphabet Compass (guesser
// Power Choice reward, Rare).
//
// From the moment it is picked until the word is guessed, one non-green
// tile of every guess shows an arrow toward the secret's letter in that
// spot (see server/utils/alphabetCompass.js). clearRoundState
// (normalTransitions.js) refreshes the readings after every turn, so new
// rows get theirs and a moved secret is re-read; clearRoundPowerActivity
// switches it off when the round ends.
//
// state.powers.alphabetCompassRows is redacted from everyone but the
// guesser in safeState.js.
const engine = require("../powerEngineServer.js");
const { compassReading, refreshCompass } = require("../../utils/alphabetCompass.js");

// The board's rows as full readings (every tile), in board order.
function compassRows(state) {
  return (state.history || [])
    .filter(entry => entry?.guess)
    .map(entry => compassReading(state.secret, entry.guess));
}

engine.registerPower("alphabetCompass", {
  apply(state, action, roomId, io) {
    if (state.powers.alphabetCompassUsed) return false;
    if (!state.secret) return false;
    if (!compassRows(state).length) return false;
    state.powers.alphabetCompassUsed = true;
    state.powers.alphabetCompassActive = true;
    state.powers.alphabetCompassPicks = [];
    refreshCompass(state);
    io.to(roomId).emit("powerUsed", { type: "alphabetCompass" });
  }
});

module.exports = { compassReading, compassRows, refreshCompass };
