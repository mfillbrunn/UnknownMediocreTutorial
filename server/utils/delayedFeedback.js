// utils/delayedFeedback.js — shared logic for the "Delayed Intel" setter
// power: a ONE-TIME-USE activation that delays a single round's feedback
// -- the guesser doesn't get to see that one round's result until they've
// submitted their NEXT guess (state.pendingGuess is set). Every other
// round (before or after the delayed one) stays visible as normal. Every
// guesser-facing surface derived from feedback history (history tiles,
// the constraint/hint row, the on-screen keyboard, and the Wiretap
// remaining-secrets count) needs to agree on this same cutoff or the
// withheld round leaks through whichever surface forgot to check it.
//
// The constraint row and keyboard don't need their own special-casing —
// both are built from safeState.js's ALREADY-masked safe.history (see
// safeState.js), so masking fbGuesser there is the single source of
// truth for those two. Only the history tiles themselves (which need to
// render something honest rather than fbGuesser's placeholder) and the
// Wiretap remaining-count (which reads the real, unmasked state.history
// directly, bypassing safeState's masking) need this helper.

// How many of state.history's entries the guesser currently has real
// information about. Entries beyond this count exist server-side (the
// setter already reacted, real feedback is computed) but haven't
// "unlocked" for the guesser yet.
function guesserVisibleHistoryCount(state) {
  const total = state?.history?.length || 0;
  const affected = state?.powers?.delayedIntelRoundIndex;

  if (typeof affected !== "number" || total <= affected) return total;

  // Double Tap pushes TWO history entries for what's really a single round
  // (resolveDoubleGuess in normal.js) -- if Delayed Intel was armed for
  // that round, both entries have to unlock together, or the shown guess's
  // feedback would leak a round early while the hidden one stayed withheld.
  const span = state.history[affected]?.doubleGuessApplied ? 2 : 1;
  const unlockAt = affected + span;

  // A round after the delayed one already exists in history -- that could
  // only happen once the guesser's next guess was already submitted AND
  // scored, meaning the delayed round already unlocked.
  if (total > unlockAt) return total;

  // The delayed round (or double-tap pair) is the latest one recorded. It
  // unlocks the instant the guesser submits their next guess
  // (state.pendingGuess set) -- until then, withhold it.
  if (total === unlockAt) {
    return state.pendingGuess ? total : affected;
  }

  // Still mid-span (shouldn't normally happen -- a double-tap pair is
  // pushed atomically -- but stay conservative and keep withholding).
  return affected;
}

module.exports = { guesserVisibleHistoryCount };
