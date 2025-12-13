// /powers/powers/blindSpotServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("blindSpot", {
  apply(state, action, roomId, io) {
    if (state.powers.blindSpotUsed) return;

    // Pick random non-green position
    const greens = new Set();
    for (const entry of state.history) {
      for (let i = 0; i < 5; i++) {
        if (entry.fb && entry.fb[i] === "🟩") greens.add(i);
      }
    }

    const candidates = [0,1,2,3,4].filter(i => !greens.has(i));
    if (candidates.length === 0) return;

    const idx = candidates[Math.floor(Math.random() * candidates.length)];

    state.powers.blindSpotUsed = true;
    state.powers.blindSpotIndex = idx;

    io.to(roomId).emit("powerUsed", { type: "blindSpot", index: idx });
  },

  postScore(state, entry) {
    const idx = state.powers.blindSpotIndex;
    if (idx == null) return;

    // Do not override greens
    if (entry.fb[idx] === "🟩") return;

    // Mask both feedbacks
    entry.fb[idx] = "⬛";
    entry.fbGuesser[idx] = "⬛";

    entry.blindSpotApplied = idx;
  }
});
