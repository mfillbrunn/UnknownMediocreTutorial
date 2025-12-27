const engine = require("../powerEngineServer.js");

engine.registerPower("blindSpot", {
  apply(state, action, roomId, io) {
    if (state.powers.blindSpotUsed) return;

    // Collect green positions from history
    const greens = new Set();

    for (const entry of state.history) {
      if (!entry.fb) continue;
      for (let i = 0; i < 5; i++) {
        if (entry.fb[i] === "🟩") greens.add(i);
      }
    }

    // ALSO respect extraConstraints
    for (const c of state.extraConstraints || []) {
      if (c.type === "GREEN") {
        greens.add(c.index);
      }
    }

    const candidates = [0,1,2,3,4].filter(i => !greens.has(i));
    if (candidates.length === 0) return;

    const idx = candidates[Math.floor(Math.random() * candidates.length)];

    state.powers.blindSpotUsed = true;
    state.powers.blindSpotIndex = idx;

    // Applies from THIS round onward
    state.powers.blindSpotRoundIndex = state.history.length;

    io.to(roomId).emit(
      "toast",
      `Blind Spot activated on position ${idx + 1}`
    );
  }
});
