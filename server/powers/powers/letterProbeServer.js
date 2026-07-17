// powers/powers/letterProbeServer.js
//
// Guesser power (once per match): the guesser submits 5 letters and learns
// ONLY how many of them appear in the current secret — just the number, no
// positions, no which-ones. The count is distinct tested letters present
// in the secret (testing AEIOU tells you how many vowels the secret has).
//
// The result is sent privately to the guesser's own socket so the setter
// never learns which letters were probed or the answer; the public action
// log only shows a generic "Recon Sweep used" line.

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

    // Public: generic "used" line for the log (no letters, no count).
    io.to(roomId).emit("powerUsed", { type: "letterProbe" });

    // Private: the actual answer, only to the guesser who used it.
    const guesserSocketId = room?.playersByUserId?.[action.userId]?.socketId;
    if (guesserSocketId) {
      io.to(guesserSocketId).emit("letterProbeResult", {
        letters: raw,
        distinctTested: tested.length,
        count
      });
    }
  }
});
