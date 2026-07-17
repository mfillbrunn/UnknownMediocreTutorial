// powers/powers/revealLocationServer.js
//
// Always-on guesser power (no activation) — "Informant".
//
// The informant peeks ONE unknown position and shows the guesser whatever
// letter is currently sitting there in the secret. It does NOT lock the
// position (the setter is free to change that letter within the usual
// consistency rules) — it's a peek, refreshed each of the guesser's turns
// against the current secret. The peeked position stays FIXED until the
// guesser confirms it green through their own play; then the informant
// moves on to a different still-unknown position.
//
// The peek is private to the guesser (redacted from the setter in
// safeState) so the setter doesn't learn which position is being watched.
//
// revealLocationPeekIndex = the fixed position being watched.
// revealLocationPeek = { index, letter } = what to show the guesser now.

const engine = require("../powerEngineServer");

function knownGreenPositions(state) {
  const green = new Set();
  for (const past of state.history ?? []) {
    const fb = Array.isArray(past?.fbGuesser) ? past.fbGuesser
             : Array.isArray(past?.fb) ? past.fb : null;
    if (!fb) continue;
    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟩") green.add(i);
    }
  }
  // Positions locked green by other powers count as "known" too.
  for (const c of state.extraConstraints ?? []) {
    if (c.type === "GREEN") green.add(c.index);
  }
  return green;
}

engine.registerPower("revealLocation", {
  turnStart(state, role, roomId, io) {
    if (role !== state.guesser) return;
    if (state.phase !== "normal") return;
    if (!state.activePowers?.includes("revealLocation")) return;
    if (!state.secret || state.secret.length !== 5) return;

    const green = knownGreenPositions(state);

    let peekIndex = state.powers.revealLocationPeekIndex;

    // Repick when there's no peek yet, or the watched position has become
    // green (the guesser caught up to it) — move to a new unknown spot.
    if (peekIndex == null || green.has(peekIndex)) {
      const options = [0, 1, 2, 3, 4].filter(i => !green.has(i));
      if (!options.length) {
        // Board effectively solved — nothing left to peek.
        state.powers.revealLocationPeekIndex = null;
        state.powers.revealLocationPeek = null;
        return;
      }
      peekIndex = options[Math.floor(Math.random() * options.length)];
      state.powers.revealLocationPeekIndex = peekIndex;
    }

    const letter = state.secret[peekIndex].toUpperCase();
    const prev = state.powers.revealLocationPeek;
    state.powers.revealLocationPeek = { index: peekIndex, letter };

    // The peek is shown to the guesser via the redacted
    // state.powers.revealLocationPeek badge (safeState keeps it for the
    // guesser, strips it from the setter), so it just updates on the next
    // state broadcast — no per-position emit that could leak to the setter.
    //
    // Only when the WATCHED POSITION changes (a new spot chosen) do we mark
    // a public power-use for the action log: a bare "used" line with no
    // index/letter, so the setter learns the informant moved but not where.
    const positionChanged = !prev || prev.index !== peekIndex;
    if (positionChanged) {
      io.to(roomId).emit("powerUsed", { type: "revealLocation" });
    }
  }
});
