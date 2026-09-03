const engine = require("../powerEngineServer.js");

// Powers that scramble or withhold what the guesser actually saw on a
// guess -- Magic Mode reads off the guesser's OWN view (entry.fbGuesser),
// so if the setter used any of these on this same guess there's nothing
// honest left to react to and it shouldn't reveal anything. Each leaves
// its own marker on the entry, except Delayed Clue (delayedIntel), which
// never touches the entry itself -- it only records which round index it
// covers on state.powers, compared against entry.roundIndex below.
function opponentObscuredThisGuess(state, entry) {
  return !!(
    entry.confuseApplied ||    // Blue Mode / Confuse Colors
    entry.countOnlyApplied ||  // Counts Only
    entry.fakeFeedback ||      // Falsify Intel
    entry.feedbackLieApplied ||// Feedback Lie
    entry.blindGuessApplied || // Total Blackout
    (state.powers.delayedIntelUsed &&
      state.powers.delayedIntelRoundIndex === entry.roundIndex) // Delayed Clue
  );
}

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

    // Single-use per activation either way -- consumed here even when it
    // ends up revealing nothing below.
    state.powers.magicModeActive = false;

    if (opponentObscuredThisGuess(state, entry)) return;

    const added = [];
    const guess = entry.guess.toUpperCase();
    const secret = state.secret.toUpperCase();
    const fbGuesser = Array.isArray(entry.fbGuesser) ? entry.fbGuesser : entry.fb;

    for (let i = 0; i < 5; i++) {
      if (fbGuesser?.[i] !== "🟨") continue;

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
  },

  turnStart() {}
});
