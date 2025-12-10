// /powers/powers/reuseLettersServer.js
const engine = require("../powerEngineServer.js");

function pickBlackLetters(state) {
  const black = new Set();

  for (const row of state.history) {
    row.fb.forEach((tile, i) => {
      if (tile === "⬛") {
        black.add(row.guess[i].toUpperCase());
      }
    });
  }

  return Array.from(black);
}

engine.registerPower("reuseletters", {
  apply(state, action, roomId, io) {
    console.log("[DEBUG] reuseletters APPLY reached!");
    if (state.powers.reuseLettersUsed) return;

    const blackLetters = pickBlackLetters(state);
    const pool = [];

    while (pool.length < 4 && blackLetters.length > 0) {
      const idx = Math.floor(Math.random() * blackLetters.length);
      pool.push(blackLetters[idx]);
      blackLetters.splice(idx, 1);
    }

    // Mark active
    state.powers.reuseLettersUsed = true;
    state.powers.reuseLettersJustApplied = true;   // <--- IMPORTANT
    state.powers.reuseLettersPool = pool;

    io.to(roomId).emit("powerUsed", {
      type: "reuseLetters",
      letters: pool
    });
  },

  postScore(state, entry) {
    if (state.powers.reuseLettersUsed) {

      // Always include the pool so UI knows what letters can be reused
      entry.reuseLetters = [...state.powers.reuseLettersPool];

      // But only tag the turn when power was first used
      if (state.powers.reuseLettersJustApplied) {
        entry.powerUsed = "ReuseLetters";
        state.powers.reuseLettersJustApplied = false;  // <--- RESET
      }
    }
  }
});
