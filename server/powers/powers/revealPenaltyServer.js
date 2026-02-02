// powers/powers/revealPenaltyServer.js
const engine = require("../powerEngineServer");

engine.registerPower("revealPenalty", {
  apply(state, action, roomId, io) {
    // Once per match
    if (state.powers.revealPenaltyUsed) return false;

    const letter = action.letter?.toUpperCase();
    if (!letter || letter.length !== 1) return false;

    // Compute known letters (greens + yellows + constraints)
    const known = new Set();

    for (const past of state.history ?? []) {
      if (!past?.fb) continue;
      for (let i = 0; i < 5; i++) {
        if (past.fb[i] === "🟩" || past.fb[i] === "🟨" || past.fb[i] === "⬛") {
          known.add(past.guess[i]);
        }
      }
    }

    for (const c of state.extraConstraints ?? []) {
      if (c.letter) known.add(c.letter.toUpperCase());
    }

    if (known.has(letter)) return false;

    state.powers.revealPenaltyUsed = true;
    state.powers.revealPenaltyActive = true;
    state.powers.revealPenaltyLetter = letter;    

    // Reveal to both players immediately
    io.to(roomId).emit("toast", `The setter revealed the letter ${letter}.`);
    io.to(roomId).emit("powerUsed", { type: "revealPenalty" });
  }
});
