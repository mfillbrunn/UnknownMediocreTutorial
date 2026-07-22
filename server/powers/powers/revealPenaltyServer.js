// powers/powers/revealPenaltyServer.js
//
// Marked Weakness: the setter reveals an unknown letter. The guesser can
// then either call it a bluff or leave it be:
//   - Call the bluff (resolveBluffCall, below): resolved IMMEDIATELY
//     against whatever the secret currently is. Right (letter really
//     isn't there) -> the guesser gets a free green letter, same reward
//     shape as a completed quest. Wrong (letter really is there) -> the
//     setter gets +2 points and that letter is locked out of guesses for
//     the rest of the round (checked in game-engine/validation.js).
//   - Never called -> resolved passively at game end (gameOver.js): the
//     setter gets +1 point for every time the letter appears in the
//     final secret.
const engine = require("../powerEngineServer");

engine.registerPower("revealPenalty", {
  apply(state, action, roomId, io) {
    // Once per round
    if (state.powers.revealPenaltyUsed) return false;

    const letter = action.letter?.toUpperCase();
    if (!letter || letter.length !== 1) return false;

    // Compute known letters (greens + yellows + constraints)
    const known = new Set();

    for (const past of state.history ?? []) {
      if (!past?.fb) continue;
      for (let i = 0; i < 5; i++) {
        if (past.fb[i] === "🟩" || past.fb[i] === "🟨" || past.fb[i] === "⬛") {
          known.add(past.guess[i]);
        }
      }
    }

    for (const c of state.extraConstraints ?? []) {
      if (c.letter) known.add(c.letter.toUpperCase());
    }

    if (known.has(letter)) return false;

    state.powers.revealPenaltyUsed = true;
    state.powers.revealPenaltyAwaitingCall = true;
    state.powers.revealPenaltyLetter = letter;

    io.to(roomId).emit("powerUsed", { type: "revealPenalty" });
  }
});

// Free green-letter reward for catching a bluff -- same pick logic as
// questServer.js's grantQuestReward (random still-unrevealed position of
// the CURRENT secret, since that's what the call was just checked against).
function grantBluffCaughtReward(state, roomId, io) {
  const greenPositions = new Set();
  for (const entry of state.history ?? []) {
    if (!entry?.fb) continue;
    for (let i = 0; i < 5; i++) {
      if (entry.fb[i] === "🟩") greenPositions.add(i);
    }
  }
  for (const c of state.extraConstraints ?? []) {
    if (c.type === "GREEN") greenPositions.add(c.index);
  }

  const options = [0, 1, 2, 3, 4].filter(i => !greenPositions.has(i));
  if (!options.length) return;

  const index = options[Math.floor(Math.random() * options.length)];
  const letter = state.secret[index].toUpperCase();

  state.extraConstraints ??= [];
  if (!state.extraConstraints.some(c => c.type === "GREEN" && c.index === index)) {
    state.extraConstraints.push({ type: "GREEN", index, letter });
    io.to(roomId).emit("greenLetterRevealed", { index, letter, source: "bluffCaught" });
  }
}

// Entry point for the guesser's "Call the bluff" tap (InfoBadgeEngine's
// onClick in public/powerEngine/powers/revealPenalty.js). Returns false
// (no-op) if there's nothing to call right now, so the caller can skip the
// room broadcast on a stale/duplicate click.
function resolveBluffCall(state, userId, roomId, io) {
  if (userId !== state.guesser) return false;

  const p = state.powers;
  if (!p.revealPenaltyUsed || !p.revealPenaltyAwaitingCall || p.revealPenaltyCalled) {
    return false;
  }

  const letter = p.revealPenaltyLetter;
  p.revealPenaltyCalled = true;
  p.revealPenaltyAwaitingCall = false;

  const inSecret = (state.secret || "").toUpperCase().includes(letter);

  if (inSecret) {
    p.revealPenaltyCallResult = "wrong";
    state.guessCount += 2;
    p.revealPenaltyBannedLetter = letter;
  } else {
    p.revealPenaltyCallResult = "caught";
    grantBluffCaughtReward(state, roomId, io);
  }

  io.to(roomId).emit("revealPenaltyCallResolved", {
    letter,
    result: p.revealPenaltyCallResult
  });

  return true;
}

module.exports = { resolveBluffCall };
