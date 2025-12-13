// /powers/powers/hideTileServer.js
// Server-side logic for Hide Tile power (setter ability)
const engine = require("../powerEngineServer.js");

engine.registerPower("hideTile", {
  apply(state, action, roomId, io) {
    const maxTiles = 2;
    if (state.powers.hideTileUsed && state.powers.hideTilePendingCount === 0) return;
    state.powers.hideTileUsed = true;
    state.powers.hideTilePendingCount = Math.min(
      maxTiles,
      state.powers.hideTilePendingCount + 1
    );
    io.to(roomId).emit("powerUsed", { type: "hideTile" });
  },

  preScore(state) {
  if (state.powers.hideTilePendingCount > 0) {
    const count = state.powers.hideTilePendingCount;
    state.powers.hideTilePendingCount = 0;

    const guess = state.pendingGuess.toUpperCase();

    // -------------------------------------------------------
    // 1. Build letter-level knowledge from past rounds
    // -------------------------------------------------------
    const letterKnownGreen = new Set(); // letter appears green somewhere
    const letterKnownBlack = new Set(); // letter appears black somewhere

    for (const entry of state.history) {
      const g = entry.guess.toUpperCase();
      const f = entry.fb;
      if (!f) continue;

      for (let i = 0; i < 5; i++) {
        if (f[i] === "🟩") letterKnownGreen.add(g[i]);
        if (f[i] === "⬛") letterKnownBlack.add(g[i]);
      }
    }

    // -------------------------------------------------------
    // 2. Identify which positions we are allowed to hide
    // -------------------------------------------------------
    const eligible = [];

    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];

      // RULE 1: never hide letters known to be black globally
      if (letterKnownBlack.has(letter)) continue;

      // RULE 2: if letter was EVER green before, do NOT hide its green instance
      //         but DO allow hiding other instances of that letter.
      //
      // For that we need to calculate feedback for THIS round:
      const { scoreGuess } = require("../../game-engine/scoring");
      const fb = scoreGuess(state.secret, state.pendingGuess);

      const thisIsGreenNow = fb[i] === "🟩";

      if (letterKnownGreen.has(letter) && thisIsGreenNow) {
        // Cannot hide THIS tile — it's a known-correct position
        continue;
      }

      // Otherwise, this tile is eligible
      eligible.push(i);
    }

    // -------------------------------------------------------
    // 3. If no eligible tiles, do nothing
    // -------------------------------------------------------
    if (eligible.length === 0) {
      state.powers.currentHiddenIndices = null;
      return;
    }

    // -------------------------------------------------------
    // 4. Randomly pick up to N
    // -------------------------------------------------------
    const hidden = new Set();
    while (hidden.size < Math.min(count, eligible.length)) {
      hidden.add(eligible[Math.floor(Math.random() * eligible.length)]);
    }

    state.powers.currentHiddenIndices = Array.from(hidden);
  }
},


  postScore(state, entry) {
    // Hidden indices applied this turn?
    entry.hiddenIndices = state.powers.currentHiddenIndices || null;
    if (entry.hiddenIndices) {
      entry.hideTileApplied = true;
      entry.powerUsed = "HideTile";
    }
    state.powers.currentHiddenIndices = null;
}

});
