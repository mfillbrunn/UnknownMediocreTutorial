// powers/powers/letterProbeServer.js
//
// Guesser power (once per match): the guesser submits 5 letters and learns
// ONLY how many of them appear in the current secret — just the number, no
// positions, no which-ones. The count is distinct tested letters present
// in the secret (testing AEIOU tells you how many vowels the secret has).
//
// The result is sent privately to the guesser's own socket (popup), stashed
// on state.powers so the guesser's info badge can show it for the rest of
// the turn, and attached to the guesser's own next history entry (via
// postScore) so it's a permanent line in their action log — never the
// setter's, who only ever sees the generic public "used" line. safeState.js
// redacts both the state.powers field and the entry field for the setter.

const engine = require("../powerEngineServer");

engine.registerPower("letterProbe", {
  apply(state, action, roomId, io, room) {
    if (state.powers.letterProbeUsed) return false;
    if (state.turn !== state.guesser) return false;

    const raw = (action.letters || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (raw.length !== 5) return false;

    state.powers.letterProbeUsed = true;

    const tested = [...new Set(raw.split(""))];
    const secretLetters = new Set((state.secret || "").toUpperCase().split(""));
    const count = tested.filter(l => secretLetters.has(l)).length;

    const result = { letters: raw, distinctTested: tested.length, count };

    // Persisted so the guesser's info badge can show it for the rest of the
    // turn (cleared by postScore below once their next guess resolves).
    state.powers.letterProbeResult = result;

    // Public: generic "used" line for the log (no letters, no count).
    io.to(roomId).emit("powerUsed", { type: "letterProbe" });

    // Private: the actual answer, only to the guesser who used it.
    const guesserSocketId = room?.playersByUserId?.[action.userId]?.socketId;
    if (guesserSocketId) {
      io.to(guesserSocketId).emit("letterProbeResult", result);
    }
  },

  postScore(state, entry) {
    if (!state.powers.letterProbeResult) return;
    // Attaches to the guesser's own next-scored guess this round — the
    // natural pairing, since the probe can only be used once per round and
    // is always followed by that round's guess. safeState strips this for
    // the setter, so it's a guesser-only permanent log line.
    entry.letterProbeResult = state.powers.letterProbeResult;
    state.powers.letterProbeResult = null;
  }
});
