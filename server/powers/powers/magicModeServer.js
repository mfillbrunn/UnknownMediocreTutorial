const engine = require("../powerEngineServer.js");

engine.registerPower("magicMode", {
  apply(state, action, roomId, io) {
    if (state.powers.magicModeUsed) return false;
    state.powers.magicModeUsed = true;

    // Arm the power for the NEXT scoring
    state.powers.magicModeActive = true;
    io.to(roomId).emit("powerUsed", { type: "magicMode" });
  },

  postScore(state, entry, roomId, io) {
  if (!state.powers.magicModeActive) return;

  const added = [];
  const guess = entry.guess.toUpperCase();
  const secret = state.secret.toUpperCase();

  for (let i = 0; i < 5; i++) {
    const fb = entry.fb?.[i];
    if (fb !== "🟨") continue;

    const guessedLetter = guess[i];

    // Find all correct positions of this letter in the secret
    for (let j = 0; j < 5; j++) {
      if (secret[j] !== guessedLetter) continue;

      // Avoid duplicate constraints
      const exists = state.extraConstraints.some(
        c => c.type === "GREEN" && c.index === j
      );
      if (exists) continue;

      state.extraConstraints.push({
        type: "GREEN",
        index: j,
        letter: guessedLetter
      });

      added.push({ index: j, letter: guessedLetter });
    }
  }

  // One combined announcement for every letter this activation reveals,
  // instead of a separate greenLetterRevealed splash per letter that would
  // stack/overwrite each other when more than one yellow converts at once.
  if (added.length > 0) {
    io?.to(roomId)?.emit("magicModeRevealed", { added });
  }

  // Power is single-use per activation
  state.powers.magicModeActive = false;
}
,

  turnStart() {}
});
