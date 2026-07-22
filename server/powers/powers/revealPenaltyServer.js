// powers/powers/revealPenaltyServer.js
//
// Marked Weakness: the setter claims a letter IS in the secret. The
// guesser then either accepts or calls the claim a bluff -- always
// resolved IMMEDIATELY (resolveClaim, below), never deferred to game end:
//   - Accept: trusts the claim without checking it. The setter scores 1
//     point, no matter whether the claim was actually true.
//   - Call, and the claim was true (the letter really is in the secret):
//     the setter scores 2 points -- calling a truthful claim backfires on
//     the guesser.
//   - Call, and the claim was false (an actual bluff, letter isn't in the
//     secret): the guesser gets a free yellow letter instead.
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
    state.powers.revealPenaltyLetter = letter;

    io.to(roomId).emit("powerUsed", { type: "revealPenalty" });
  }
});

// Free yellow-letter reward for catching a bluff -- same pick logic as
// questServer.js's grantQuestYellowEarly (random letter that's actually in
// the secret and not already known, since the claimed letter itself is
// confirmed ABSENT and so useless as a reward).
function pickYellowRewardLetter(state) {
  const known = new Set();
  for (const past of state.history ?? []) {
    if (!past?.fb) continue;
    for (let i = 0; i < 5; i++) {
      if (past.fb[i] === "🟩" || past.fb[i] === "🟨") known.add(past.guess[i]);
    }
  }
  for (const c of state.extraConstraints ?? []) {
    if (c.letter) known.add(c.letter.toUpperCase());
  }

  const secretLetters = [...new Set((state.secret || "").toUpperCase().split(""))];
  const options = secretLetters.filter(l => !known.has(l));
  if (!options.length) return null;

  return options[Math.floor(Math.random() * options.length)];
}

// Entry point for the guesser's Accept/Call response (InfoBadgeEngine's
// onClick pair in public/powerEngine/powers/revealPenalty.js). Returns
// false (no-op) if there's nothing to resolve right now, so the caller can
// skip the room broadcast on a stale/duplicate click.
function resolveClaim(state, userId, roomId, io, accepted) {
  if (userId !== state.guesser) return false;

  const p = state.powers;
  if (!p.revealPenaltyUsed || p.revealPenaltyResolved) return false;

  const letter = p.revealPenaltyLetter;
  const inSecret = (state.secret || "").toUpperCase().includes(letter);

  p.revealPenaltyResolved = true;

  let yellowLetter = null;

  if (accepted) {
    p.revealPenaltyResult = "accepted";
    state.guessCount += 1;
  } else if (inSecret) {
    p.revealPenaltyResult = "wrongCall";
    state.guessCount += 2;
  } else {
    p.revealPenaltyResult = "bluffCaught";
    yellowLetter = pickYellowRewardLetter(state);
    if (yellowLetter) {
      state.extraConstraints ??= [];
      state.extraConstraints.push({ type: "YELLOW", letter: yellowLetter });
    }
  }

  io.to(roomId).emit("revealPenaltyResolved", {
    letter,
    result: p.revealPenaltyResult,
    yellowLetter
  });

  return true;
}

module.exports = { resolveClaim };
