// utils/delayedFeedback.js — shared logic for the "Delayed Intel" setter
// power: the guesser doesn't get to see a round's feedback until they've
// submitted their NEXT guess (state.pendingGuess is set) — every earlier
// round stays visible as normal. Every guesser-facing surface derived
// from feedback history (history tiles, the constraint/hint row, the
// on-screen keyboard, and the Wiretap remaining-secrets count) needs to
// agree on this same cutoff or the withheld round leaks through whichever
// surface forgot to check it.
//
// The constraint row and keyboard don't need their own special-casing —
// both are built from safeState.js's ALREADY-masked safe.history (see
// safeState.js), so masking fbGuesser there is the single source of
// truth for those two. Only the history tiles themselves (which need to
// render something honest rather than fbGuesser's placeholder) and the
// Wiretap remaining-count (which reads the real, unmasked state.history
// directly, bypassing safeState's masking) need this helper.

function isDelayedIntelActive(state) {
  return !!state?.activePowers?.includes("delayedIntel");
}

// How many of state.history's entries the guesser currently has real
// information about. Entries beyond this count exist server-side (the
// setter already reacted, real feedback is computed) but haven't
// "unlocked" for the guesser yet.
function guesserVisibleHistoryCount(state) {
  const total = state?.history?.length || 0;
  if (!isDelayedIntelActive(state)) return total;
  if (total === 0) return 0;
  // The most recent round stays hidden until the guesser has submitted
  // their next guess (state.pendingGuess set) — at that instant it
  // unlocks immediately, matching the setter power description exactly.
  return state.pendingGuess ? total : total - 1;
}

module.exports = { isDelayedIntelActive, guesserVisibleHistoryCount };
