const engine = require("../powerEngineServer.js");

engine.registerPower("magicMode", {
  apply(state) {
    if (state.powers.magicModeUsed) return;
    state.powers.magicModeUsed = true;
    state.powerUsedThisTurn = true;

    // Arm the power for the NEXT scoring
    state.powers.magicModeActive = true;
  },

  postScore(state, entry, roomId, io) {
    if (!state.powers.magicModeActive) return;

    const added = [];

    for (let i = 0; i < 5; i++) {
      const fb = entry.fbGuesser?.[i];
      if (fb !== "🟨") continue;

      const letter = state.secret[i].toUpperCase();

      // Avoid duplicate constraints
      const exists = state.extraConstraints.some(
        c => c.type === "GREEN" && c.index === i
      );
      if (exists) continue;

      state.extraConstraints.push({
        type: "GREEN",
        index: i,
        letter
      });

      added.push({ index: i, letter });
    }

    if (added.length > 0) {
      io?.to(roomId)?.emit(
        "toast",
        `Magic Mode locked in ${added.length} correct position${added.length > 1 ? "s" : ""}!`
      );
    } else {
      io?.to(roomId)?.emit(
        "toast",
        "Magic Mode found no new positions to lock in."
      );
    }

    // One-shot power
    state.powers.magicModeActive = false;
  },

  turnStart() {}
});
