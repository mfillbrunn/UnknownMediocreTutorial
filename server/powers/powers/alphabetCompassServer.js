// /powers/powers/alphabetCompassServer.js — Alphabet Compass (guesser
// Power Choice reward, Rare).
//
// For the rest of the guesser's current turn, every earlier row on their
// board swaps its colors for a compass reading of each tile against the
// CURRENT secret: "L" when the secret's letter in that position comes
// earlier in the alphabet than the guessed letter, "R" when it comes later,
// "G" when they match. The readings are computed once, here, because the
// client never holds the secret. clearRoundState (normalTransitions.js)
// switches the effect off the moment the guesser submits, so the board is
// back to ordinary colors from the next turn on.
//
// state.powers.alphabetCompassRows is redacted from everyone but the
// guesser in safeState.js.
const engine = require("../powerEngineServer.js");

// One reading per tile: "L" (secret letter is earlier), "R" (later), "G".
function compassReading(secret, guess) {
  const target = String(secret || "").toUpperCase();
  const word = String(guess || "").toUpperCase();
  return Array.from({ length: 5 }, (_unused, index) => {
    const want = target[index];
    const got = word[index];
    if (!want || !got) return null;
    if (want === got) return "G";
    return want < got ? "L" : "R";
  });
}

// One entry per history row that has a guess, in board order -- the same
// rows (and order) the client's buildHistoryRenderState draws.
function compassRows(state) {
  return (state.history || [])
    .filter(entry => entry?.guess)
    .map(entry => compassReading(state.secret, entry.guess));
}

engine.registerPower("alphabetCompass", {
  apply(state, action, roomId, io) {
    if (state.powers.alphabetCompassUsed) return false;
    if (!state.secret) return false;
    const rows = compassRows(state);
    if (!rows.length) return false;
    state.powers.alphabetCompassUsed = true;
    state.powers.alphabetCompassActive = true;
    state.powers.alphabetCompassRows = rows;
    io.to(roomId).emit("powerUsed", { type: "alphabetCompass" });
  }
});

module.exports = { compassReading, compassRows };
