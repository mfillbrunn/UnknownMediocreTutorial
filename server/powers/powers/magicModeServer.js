engine.registerPower("magicMode", {
  apply(state, roomId, io) {
    if (state.powers.magicModeUsed) return;
    state.powers.magicModeUsed = true;
    state.powerUsedThisTurn = true;

    const lastIndex = state.history.length - 1;
    const entry = state.history[lastIndex];
    if (!entry) return;

    const added = [];

    for (let i = 0; i < 5; i++) {
      const fb = entry.fbGuesser?.[i];
      if (fb === "🟨") {
        const letter = state.secret[i].toUpperCase();

        // Avoid duplicate constraints
        const exists = state.extraConstraints.some(
          c => c.type === "GREEN" && c.index === i
        );
        if (!exists) {
          state.extraConstraints.push({
            type: "GREEN",
            index: i,
            letter
          });
          added.push({ index: i, letter });
        }
      }
    }

    if (added.length > 0) {
      io?.to(roomId)?.emit(
        "toast",
        `Magic Mode revealed ${added.length} correct position${added.length > 1 ? "s" : ""}!`
      );
    }
  },

  postScore() {},
  turnStart() {}
});
