// /powers/powers/firstLetterRevealServer.js — First Letter Reveal (guesser
// power, Power Choice Legendary reward). Reveals the secret's first letter
// as a permanent GREEN extraConstraint at position 0 -- the same mechanism
// Trade a Green's addGreen() and Hard Mode's forced-green tracking already
// use. That's what makes it "for the remainder of the round": any New
// secret the Secretkeeper later picks must keep this exact letter at
// position 0 (isConsistentWithHistory, game-engine/history.js, rejects any
// secret that doesn't), and extraConstraints itself resets fresh at the
// next round transition, so the clue never outlives the round it was
// granted in.
const engine = require("../powerEngineServer.js");

function firstLetterAlreadyKnown(state) {
  for (const constraint of state.extraConstraints || []) {
    if (constraint?.type === "GREEN" && constraint.index === 0) return true;
  }
  for (const entry of state.history || []) {
    if (Array.isArray(entry.fb) && entry.fb[0] === "🟩") return true;
  }
  return false;
}

engine.registerPower("firstLetterReveal", {
  apply(state, action, roomId, io) {
    if (state.powers.firstLetterRevealUsed) return false;
    if (firstLetterAlreadyKnown(state)) return false;

    const letter = String(state.secret || "").toUpperCase()[0];
    if (!letter) return false;

    state.powers.firstLetterRevealUsed = true;
    state.powers.firstLetterRevealedLetter = letter;
    state.extraConstraints ||= [];
    state.extraConstraints.push({ type: "GREEN", index: 0, letter });

    io.to(roomId).emit("toast", `First letter revealed: ${letter}`);
    io.to(roomId).emit("powerUsed", { type: "firstLetterReveal" });
  },

  postScore() {},
  turnStart() {}
});
