// powers/powers/revealLocationServer.js
//
// Always-on guesser power (no activation) — "Informant".
//
// At the start of each of the guesser's normal-phase turns (i.e. right
// after the setter has committed a secret), if the guesser has caught up
// to every position this power has revealed so far, it reveals one more:
// it reads the true letter at a random not-yet-known position and locks it
// as a GREEN extraConstraint. Locking it means the setter is forced to keep
// that letter there on every future secret this round (enforced by
// isConsistentWithHistory), so it's guaranteed green after the setter
// submits — exactly the requirement.
//
// "Caught up" = the guesser has independently earned a real 🟩 at that
// position through their own guessing. Since a revealed position shows on
// the guesser's board immediately, they'll typically play it next turn,
// confirm it green, and this hands them a fresh reveal — always keeping
// them one green ahead. Reveals are permanent and accumulate.
//
// revealLocationIndices lives in state.powers (reset each round via
// createInitialPowers) and tracks the positions THIS power revealed.

const engine = require("../powerEngineServer");

function earnedGreenPositions(state) {
  const earned = new Set();
  for (const past of state.history ?? []) {
    if (!Array.isArray(past?.fb)) continue;
    for (let i = 0; i < 5; i++) {
      if (past.fb[i] === "🟩") earned.add(i);
    }
  }
  return earned;
}

engine.registerPower("revealLocation", {
  turnStart(state, role, roomId, io) {
    if (role !== state.guesser) return;
    if (state.phase !== "normal") return;
    if (!state.activePowers?.includes("revealLocation")) return;
    if (!state.secret || state.secret.length !== 5) return;

    state.powers.revealLocationIndices ??= [];

    const earned = earnedGreenPositions(state);

    // Still waiting on the guesser to confirm a prior reveal? Don't stack
    // another one — keep them exactly one green ahead.
    const pending = state.powers.revealLocationIndices.filter(i => !earned.has(i));
    if (pending.length > 0) return;

    // Candidate positions: not already earned-green, and not already
    // locked green by any power (this one or another).
    const knownGreen = new Set(earned);
    for (const c of state.extraConstraints ?? []) {
      if (c.type === "GREEN") knownGreen.add(c.index);
    }

    const options = [0, 1, 2, 3, 4].filter(i => !knownGreen.has(i));
    if (!options.length) return; // board is effectively solved

    const index = options[Math.floor(Math.random() * options.length)];
    const letter = state.secret[index].toUpperCase();

    state.extraConstraints ??= [];
    state.extraConstraints.push({ type: "GREEN", index, letter });
    state.powers.revealLocationIndices.push(index);

    io.to(roomId).emit("greenLetterRevealed", { index, letter, source: "revealLocation" });
    io.to(roomId).emit("powerUsed", { type: "revealLocation" });
  }
});
