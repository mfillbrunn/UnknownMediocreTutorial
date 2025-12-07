const engine = require("../powerEngineServer");

function pickRandomLettersFromHistory(state, max = 4) {
  const letters = new Set();

  for (const h of state.history) {
    for (const ch of h.guess.toUpperCase()) {
      letters.add(ch);
    }
  }

  const arr = Array.from(letters);
  if (arr.length <= max) return arr;

  const chosen = [];
  while (chosen.length < max && arr.length > 0) {
    const idx = Math.floor(Math.random() * arr.length);
    chosen.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return chosen;
}

engine.registerPower("reuseLetters", {
  apply(state, action, roomId, io) {
    if (state.powers.reuseLettersUsed) return;

    state.powers.reuseLettersUsed = true;
    state.powers.reuseLettersPool = pickRandomLettersFromHistory(state, 4);

    io.to(roomId).emit("powerUsed", {
      type: "reuseLetters",
      letters: state.powers.reuseLettersPool
    });
  }
});
