// /powers/powers/reuseLettersServer.js
// Server-side logic for Reuse Letters power (setter ability)
const engine = require("../powerEngineServer");

function pickBlackLetters(state) {
  const black = new Set();

  for (const row of state.history) {
    row.fb.forEach((tile, i) => {
      const letter = row.guess[i].toUpperCase();
      if (tile === "⬛") black.add(letter);
    });
  }

  return Array.from(black);
}

engine.registerPower("reuseletters", {
  apply(state, action, roomId, io) {
    if (state.powers.reuseLettersUsed) return;

    const blackLetters = pickBlackLetters(state);
    const pool = [];

    while (pool.length < 4 && blackLetters.length > 0) {
      const idx = Math.floor(Math.random() * blackLetters.length);
      pool.push(blackLetters[idx]);
      blackLetters.splice(idx, 1);
    }

    state.powers.reuseLettersUsed = true;
    state.powers.reuseLettersPool = pool;

    io.to(roomId).emit("powerUsed", {
      type: "reuseLetters",
      letters: pool
    });
  }
});
