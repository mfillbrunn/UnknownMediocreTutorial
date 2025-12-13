// /powers/powers/revealGreenServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("revealGreen", {
  apply(state, action, roomId, io) {
  if (state.powers.revealGreenUsed) return;
  if (!state.secret) return;

  const secret = state.secret.toUpperCase();

  // 1. Build a list of positions the guesser DOES NOT already know
  const unknownPositions = [];

  for (let i = 0; i < 5; i++) {
    const letter = secret[i];

    // Skip positions already revealed by feedback (true green)
    const lastEntry = state.history[state.history.length - 1];
    const greenKnown =
      lastEntry &&
      Array.isArray(lastEntry.fbGuesser) &&
      lastEntry.fbGuesser[i] === "🟩";

    // Skip positions already revealed by this power
    const alreadyRevealedByPower =
      state.powers.revealGreenPos === i;

    if (!greenKnown && !alreadyRevealedByPower) {
      unknownPositions.push(i);
    }
  }

  // 2. If everything is known, do nothing
  if (unknownPositions.length === 0) {
    console.log("RevealGreen: No unknown positions left");
    return;
  }

  // 3. Choose a random unknown position
  const pos = unknownPositions[Math.floor(Math.random() * unknownPositions.length)];
  const letter = secret[pos];

  state.powers.revealGreenUsed = true;
  state.powers.revealGreenPos = pos;
  state.powers.revealGreenLetter = letter;
  state.revealGreenInfo = { pos, letter };
  io.to(roomId).emit("powerUsed", { type: "revealGreen", pos, letter });
},


postScore(state, entry) {
  if (state.powers.revealGreenPos !== null) {

    // Attach to history entry
    entry.revealGreen = {
      pos: state.powers.revealGreenPos,
      letter: state.powers.revealGreenLetter
    };

    // Mark that the power was used
    entry.powerUsed = "RevealGreen";

    // Expose to client (so UI can update patterns)
    state.revealGreenInfo = {
      pos: state.powers.revealGreenPos,
      letter: state.powers.revealGreenLetter
    };
  }

  // One-shot reset of power state
state.powers.revealGreenPos = null;
state.powers.revealGreenLetter = null;
// DO NOT clear state.revealGreenInfo here

},
turnStart(state, role) {
  // Clear reveal info at the start of any NEW turn
  if (state.revealGreenInfo) {
    state.revealGreenInfo = null;
  }
}


});
