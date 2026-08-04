// /powers/powers/revealGreenServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("revealGreen", {
  apply(state, action, roomId, io) {
  // Two charges per round — can be activated on two separate turns
  // (never the same turn, powerUsedThisTurn already prevents that).
  if ((state.powers.revealGreenUses || 0) >= 2) return false;
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
  state.powers.revealGreenUses = (state.powers.revealGreenUses || 0) + 1;
  state.powers.revealGreenPos = pos;
  state.powers.revealGreenLetter = letter;
  state.powers.revealGreenActive = true;
  state.revealGreenInfo = { pos, letter };

  io.to(roomId).emit("powerUsed", {
    type: "revealGreen",
    pos,
    letter
  });
  // Same green-letter-reveal popup every other reveal-a-green-letter power
  // uses (Reveal Letter, Bet Power, Field Report), instead of the plain
  // toast this used to show only to the guesser.
  io.to(roomId).emit("greenLetterRevealed", { index: pos, letter, source: "revealGreen" });
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
