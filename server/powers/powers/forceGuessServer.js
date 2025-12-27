const engine = require("../powerEngineServer");

function randomDistinctLetters(n = 3) {
  const letters = [];
  while (letters.length < n) {
    const l = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    if (!letters.includes(l)) letters.push(l);
  }
  return letters;
}

engine.registerPower("forceGuess", {
  apply(state, action, roomId, io) {
    if (state.powers.forceGuessUsed) return;

    const [c, s, e] = randomDistinctLetters(3);

    state.powers.forceGuessUsed = true;
    state.powers.forcedGuessOptions = {
      contains: c,
      startsWith: s,
      endsWith: e
    };

    io.to(roomId).emit("forceGuessOptions", {
      options: state.powers.forcedGuessOptions
    });
  }
});
