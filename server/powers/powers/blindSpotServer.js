const engine = require("../powerEngineServer.js");

engine.registerPower("blindSpot", {
  apply(state, action, roomId, io) {
    if (state.powers.blindSpotUsed) return false;

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
    state.powers.blindSpotActive = true;

    // Applies from THIS round onward
    state.powers.blindSpotRoundIndex = state.history.length;

    io.to(roomId).emit(
      "toast",
      `Blind Spot activated on position ${idx + 1}`
    );
    io.to(roomId).emit("powerUsed", { type: "blindSpot" });
  },

  postScore(state, entry) {
    // Client-side, the tile at blindSpotIndex already renders purple for
    // every entry from blindSpotRoundIndex onward (see history.js's
    // computeTileClassKey), purely by comparing position/round — the
    // underlying fbGuesser value was never actually touched, so an AI
    // opponent reading state.history directly saw the true color right
    // through the mask. Mask it for real here too, matching the same "❓
    // means no info" handling hideTile/countOnly/fakeFeedback already use.
    const idx = state.powers.blindSpotIndex;
    const bsRound = state.powers.blindSpotRoundIndex;
    if (typeof idx !== "number" || typeof bsRound !== "number") return;
    if (entry.roundIndex < bsRound) return;
    if (!Array.isArray(entry.fbGuesser)) return;

    entry.fbGuesser = entry.fbGuesser.slice();
    entry.fbGuesser[idx] = "❓";
  }
});
