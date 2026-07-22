// powers/powers/revealPenaltyServer.js
//
// Marked Weakness: the setter claims a letter appears a specific number
// (1-5) of times in the secret. The guesser then either accepts or calls
// the claim a bluff -- always resolved IMMEDIATELY (resolveClaim, below),
// never deferred to game end:
//   - Accept: trusts the claim without checking it. The setter scores
//     that many points, no matter whether the claim was actually true.
//   - Call, and the claim was true: the setter scores DOUBLE (2 points
//     per occurrence) -- calling a truthful claim backfires on the guesser.
//   - Call, and the claim was false (an actual bluff): the guesser gets a
//     free green letter instead, same reward shape as a completed quest.
const engine = require("../powerEngineServer");

engine.registerPower("revealPenalty", {
  apply(state, action, roomId, io) {
    // Once per round
    if (state.powers.revealPenaltyUsed) return false;

    const letter = action.letter?.toUpperCase();
    const count = Number(action.count);
    if (!letter || letter.length !== 1) return false;
    if (!Number.isInteger(count) || count < 1 || count > 5) return false;

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
    state.powers.revealPenaltyCount = count;

    io.to(roomId).emit("powerUsed", { type: "revealPenalty" });
  }
});

// Free green-letter reward for catching a bluff -- same pick logic as
// questServer.js's grantQuestReward (random still-unrevealed position of
// the CURRENT secret, since that's what the claim was just checked against).
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

// Entry point for the guesser's Accept/Call response (InfoBadgeEngine's
// onClick pair in public/powerEngine/powers/revealPenalty.js). Returns
// false (no-op) if there's nothing to resolve right now, so the caller can
// skip the room broadcast on a stale/duplicate click.
function resolveClaim(state, userId, roomId, io, accepted) {
  if (userId !== state.guesser) return false;

  const p = state.powers;
  if (!p.revealPenaltyUsed || p.revealPenaltyResolved) return false;

  const letter = p.revealPenaltyLetter;
  const claimedCount = p.revealPenaltyCount;
  const actualCount = (state.secret || "")
    .toUpperCase()
    .split("")
    .filter(c => c === letter).length;
  const claimTrue = actualCount === claimedCount;

  p.revealPenaltyResolved = true;

  if (accepted) {
    p.revealPenaltyResult = "accepted";
    state.guessCount += claimedCount;
  } else if (claimTrue) {
    p.revealPenaltyResult = "trueCall";
    state.guessCount += claimedCount * 2;
  } else {
    p.revealPenaltyResult = "bluffCaught";
    grantBluffCaughtReward(state, roomId, io);
  }

  io.to(roomId).emit("revealPenaltyResolved", {
    letter,
    count: claimedCount,
    result: p.revealPenaltyResult
  });

  return true;
}

module.exports = { resolveClaim };
