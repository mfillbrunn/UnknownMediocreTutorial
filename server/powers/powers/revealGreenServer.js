// /powers/powers/revealGreenServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("revealGreen", {
  apply(state, action, roomId, io) {
  if (state.powers.revealGreenUsed) return false;
  if (!state.secret) return false;

  const secret = state.secret.toUpperCase();
  const unknownPositions = [];

  for (let i = 0; i < 5; i++) {
    const letter = secret[i];

    // Was this position EVER confirmed green?
    const greenKnown = state.history.some(entry =>
      Array.isArray(entry.fbGuesser) &&
      entry.fbGuesser[i] === "🟩"
    );

    // Was it already revealed by this power?
    const alreadyRevealedByPower =
      state.powers.revealGreenPos === i;

    if (!greenKnown && !alreadyRevealedByPower) {
      unknownPositions.push(i);
    }
  }

  if (unknownPositions.length === 0) {
    console.log("RevealGreen: No unknown positions left");
    return false;
  }

  const pos = unknownPositions[
    Math.floor(Math.random() * unknownPositions.length)
  ];

  const letter = secret[pos];

  state.powers.revealLetterRound = state.history.length;
  state.powers.revealGreenUsed = true;
  state.powers.revealGreenPos = pos;
  state.powers.revealGreenLetter = letter;
  state.powers.revealGreenActive = true;
  state.revealGreenInfo = { pos, letter };

  io.to(roomId).emit("powerUsed", {
    type: "revealGreen",
    pos,
    letter
  });
}
,


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
