const { scoreGuess } = require("./scoring.js");

/**
 * Normalize emoji-based feedback so comparisons are consistent. "❓"/"?"
 * are the guesser-view masking placeholders left by Redact Report, Hide
 * Evidence, and Falsify Intel (see fbGuesser below) — treated the same as
 * "" (no info at that position), never as a hard mismatch.
 */
function normalizeFB(fbArr) {
  return fbArr.map(fb => {
    if (fb === "🟩") return "🟩";
    if (fb === "🟨") return "🟨";
    if (fb === "⬛") return "⬛"; // includes ⬜ treated as black
    if (fb === "" || fb === "❓" || fb === "?") return "";
  });
}

// `opts.fbGuesser: true` switches the feedback source from the true `fb`
// (what the setter actually knows) to `fbGuesser` (what the guesser is
// actually shown, including any masking a power has applied). Every
// existing caller — secret-legality validation, power internals — keeps
// the default (true fb): those enforce a hard rule ("does this secret
// really match what was shown") that must never be fooled by a mask.
// Only a guesser's own reasoning about which secrets remain plausible
// should use the guesser view; genericAI.js's pickGuess/pickSecret pass
// this because that's exactly what they're modeling — otherwise the AI's
// decision-making reads server truth straight through a masking power
// aimed at it, and the power has no actual effect on it (see runAI.js).
function isConsistentWithHistory(history, proposedSecret, state, opts = {}) {
  const useFbGuesser = !!opts.fbGuesser;
  const extra = state?.extraConstraints ?? [];
  const forcedGreens = extra.filter(c => c.type === "GREEN");
  const forcedYellows = extra.filter(c => c.type === "YELLOW");
  proposedSecret = proposedSecret.toUpperCase();
  for (const c of forcedGreens) {
    if (proposedSecret[c.index] !== c.letter) {
      return false;
    }
  }
  // A YELLOW extraConstraint (e.g. from Field Report) promises the letter
  // is somewhere in the secret, position unspecified — any secret the
  // setter picks afterward has to actually contain it, or the promise
  // was a lie. GREEN-only enforcement here was the bug: yellows were
  // recorded but never actually bound the setter's choice.
  for (const c of forcedYellows) {
    if (!proposedSecret.includes(c.letter)) {
      return false;
    }
  }

  for (const entry of history) {
    if (entry.ignoreConstraints) continue;

    const guess = entry.guess.toUpperCase();
    const rawFb = useFbGuesser ? (entry.fbGuesser ?? entry.fb) : entry.fb;
    const actual = normalizeFB(rawFb);
     let expected = scoreGuess(proposedSecret, guess);
    // 5 — final comparison
    for (let i = 0; i < 5; i++) {
      // Confuse Colors only makes the ORIGINALLY green/yellow positions of
      // a guess unreliable to the GUESSER's own reasoning about what's
      // plausible (see confuseColorsServer.js) -- a gray position in that
      // same guess is untouched and still a hard constraint, so it must
      // not be skipped along with the recolored ones. And per this
      // function's own contract above, this relaxation must only ever
      // apply on the fbGuesser (guesser-view) path -- the default/true-fb
      // path is the hard rule that actually gates which secrets the
      // setter is allowed to switch to, and must never be fooled by any
      // mask: the setter still truly knows an original yellow/green was
      // real, even though the guesser can no longer tell which it was.
      if (useFbGuesser && entry.confuseIgnoreIndices?.includes(i)) continue;
      if ((expected[i] !== actual[i]) && actual[i] !=="") return false;
    }
  }

  return true;
}

module.exports = { isConsistentWithHistory };
if (typeof window !== "undefined") {
  window.isConsistentWithHistory = isConsistentWithHistory;
}

