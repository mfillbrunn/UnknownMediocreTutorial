const { scoreGuess } = require("../game-engine/scoring");
const { isConsistentWithHistory } = require("../game-engine/history");
const { guesserVisibleHistoryCount } = require("./delayedFeedback");
const {  getFeasibleSecrets,  getCoverAnalysis,  getCandidateRemainingCount,  buildCoverStrengthState} = require("./coverStrength");

function computeRemainingAfterIndexFromState(idx, state, allowedSecrets) {
  if (!state || !Array.isArray(state.history)) return 0;
  if (!Array.isArray(allowedSecrets) || allowedSecrets.length === 0) return 0;
  if (typeof idx !== "number" || idx < 0) return 0;

  const partialHistory = state.history.slice(0, idx + 1);
  let count = 0;

  for (const word of allowedSecrets) {
    if (isConsistentWithHistory(partialHistory, word, state)) {
      count++;
    }
  }

  return count;
}

function computeRemainingNew(
  secretWord,
  state,
  allowedSecrets
) {
  const analysis =
    getCoverAnalysis(
      state,
      allowedSecrets
    );

  if (!analysis) {
    return null;
  }

  return getCandidateRemainingCount(
    analysis,
    secretWord
  );
}

// Wiretap live tap: how many secrets would still fit if the guesser
// actually submitted `guessWord` (scored against the REAL secret). This
// reveals real information — it's the payload of the activated ability,
// only sent to the guesser during their activated turn.
function computeRemainingAfterGuess(secret, guessWord, state, allowedSecrets) {
  if (!secret || !guessWord || guessWord.length !== 5) return null;
  if (!Array.isArray(state?.history)) return null;
  const secrets =
    Array.isArray(allowedSecrets) && allowedSecrets.length
      ? allowedSecrets
      : global.ALLOWED_SECRETS;
  if (!Array.isArray(secrets) || !secrets.length) return null;

  const fb = scoreGuess(secret.toUpperCase(), guessWord.toUpperCase());
  const testHistory = [
    ...state.history,
    { guess: guessWord.toUpperCase(), fb, ignoreConstraints: false }
  ];

  let count = 0;
  for (const word of secrets) {
    if (isConsistentWithHistory(testHistory, word, state)) count++;
  }
  return count;
}

function getRemainingWordInfo(state, allowedSecrets, draftSecret) {
  if (
    !state ||
    state.phase === "simultaneous" ||
    state.phase === "lobby" ||
    state.phase === "gameOver"
  ) {
    return null;
  }

  const pendingGuess = state.pendingGuess;

  const guessIsComplete =
    !!pendingGuess &&
    !pendingGuess.includes("?");

  // Nothing for the setter to react to right now — they already Kept/New'd
  // the last guess and the Guesser hasn't submitted the next one yet.
  // Signal "nothing to show" (buildSetterRemainingBoxState below turns
  // this into visible:false) so the box disappears for the whole window
  // it isn't actually their decision to make, instead of sitting there
  // showing "Keep: ? / New: ?" placeholders the entire time. This also
  // folds away what used to be a separate stealth-carryover branch here
  // (checking history[last].stealthApplied while pendingGuess was empty)
  // — hiding the box uniformly for every between-turns window, stealth
  // round or not, keeps its mere visibility from ever being a tell either
  // way, same as it was before (both cases showed "?" placeholders then).
  if (!guessIsComplete) {
    return null;
  }

  // Stealth Guess hides the guess/feedback text from the setter for the
  // ONE guess it was used on — the remaining-word count derived from that
  // guess's real feedback would otherwise leak the same information right
  // back through the numbers. state.powers.stealthGuessActive is the live
  // signal for it, cleared the instant this guess resolves (see
  // stealthGuessServer.js), so it only ever masks the actual guess it was
  // used on, never a later, unrelated one.
  const stealthHidden = !!state.powers?.stealthGuessActive;

  if (stealthHidden) {
    return { current: null, old: -1, new: -1, hiddenByStealth: true };
  }

  // Compute current remaining — full list if no history yet
  const feasible =
    getFeasibleSecrets(
      state,
      allowedSecrets
    );

  const current =
    feasible.words.length;

  let oldCount = -1;
  let newCount = -1;

  const analysis =
    getCoverAnalysis(
      state,
      allowedSecrets
    );

  if (analysis) {
    oldCount =
      analysis.keepCount;

    if (
      typeof draftSecret ===
        "string" &&
      draftSecret.length === 5
    ) {
      newCount =
        getCandidateRemainingCount(
          analysis,
          draftSecret
        );
    }
  }

  return {
    current,
    old: oldCount,
    new: newCount
  };
}

function buildSetterRemainingBoxState(state, viewerId, allowedSecrets, draftSecret = null) {
  if (!state || state.phase === "lobby" || state.phase === "gameOver") {
    return { visible: false };
  }

  if (viewerId !== state.setter) {
    return { visible: false };
  }

  // During the simultaneous round-start phase the setter is still
  // choosing their secret -- there's no guess/feedback yet for
  // getRemainingWordInfo to filter against, so show the box with empty
  // placeholders instead of hiding it outright (it used to only appear
  // once the round's first guess landed).
  if (state.phase === "simultaneous") {
    return {
      visible: true,
      empty: true,
      current: null,
      old: null,
      new: null,
      isConsistent: true,
      highlightOld: false,
      highlightNew: false,

      coverStrength: {
        visible: false
      }
    };
  }

  const info = getRemainingWordInfo(state, allowedSecrets, draftSecret);
  if (!info) {
    return { visible: false };
  }

  // Stay visible so the setter isn't tipped off that something's
  // different this round — just show "?" instead of real numbers.
  if (info.hiddenByStealth) {
    return {
      visible: true,
      current: "?",
      old: null,
      new: null,
      isConsistent: true,
      highlightOld: false,
      highlightNew: false,

      coverStrength: {
        visible: false
      }
    };
  }

  if (info.current == null) {
    return { visible: false };
  }

  const hasDraft = typeof draftSecret === "string" && draftSecret.length === 5;

  // The draft word must both fit the clues so far AND actually be a valid
  // secret word (not merely a valid guess) — a word that's fine to guess
  // with but isn't in the secrets dictionary can never legally be planted,
  // so it gets the same ✕ treatment as one that contradicts the feedback.
  let isConsistent = true;
  if (hasDraft) {
    const isValidSecretWord =
      Array.isArray(allowedSecrets) && allowedSecrets.includes(draftSecret);
    isConsistent =
      isValidSecretWord && isConsistentWithHistory(state.history, draftSecret, state);
  }

  const hasOld = info.old > -1;
  const hasNew = info.new > -1;

  const coverStrength =
    buildCoverStrengthState(
      state,
      allowedSecrets,
      draftSecret
    );

  /*
   * The cover analysis also applies
   * the Assassin Word distance rule.
   */
  if (
    hasDraft &&
    coverStrength.visible &&
    coverStrength.draftComplete &&
    !coverStrength.draftValid
  ) {
    isConsistent = false;
  }

  return {
    visible: true,

    current:
      info.current,

    old:
      hasOld
        ? info.old
        : null,

    new:
      hasNew
        ? info.new
        : null,

    isConsistent,

    highlightOld:
      hasOld &&
      hasNew &&
      info.old > info.new,

    highlightNew:
      hasOld &&
      hasNew &&
      info.new > info.old,

    coverStrength
  };
}

// Wiretap power: the guesser sees the same "how many secrets are still
// possible" count the setter sees — the number of dictionary words still
// consistent with all feedback so far. This is derived purely from
// committed history (not the pending guess), so it's stable across the
// guesser's turn and identical to the setter's `current`. It's not a leak:
// the guesser can already compute it themselves from the feedback they see
// — UNLESS Delayed Intel is also active, in which case "the feedback they
// see" is a strict subset of state.history, and computing this count from
// the full true history would hand back exactly the information Delayed
// Intel is withholding. guesserVisibleHistoryCount() caps it to only the
// rounds the guesser has actually unlocked.
function buildGuesserRemainingBoxState(state, allowedSecrets) {
  if (
    !state ||
    state.phase !== "normal" ||
    state.gameOver
  ) {
    return { visible: false };
  }

  const secrets =
    Array.isArray(allowedSecrets) && allowedSecrets.length
      ? allowedSecrets
      : global.ALLOWED_SECRETS;

  if (!Array.isArray(secrets) || !secrets.length) {
    return { visible: false };
  }

  const visibleCount = guesserVisibleHistoryCount(state);

  let current;
  if (visibleCount === 0) {
    current = secrets.length;
  } else {
    current = computeRemainingAfterIndexFromState(visibleCount - 1, state, secrets);
  }

  return { visible: true, current };
}

module.exports = {
  computeRemainingAfterIndexFromState,
  computeRemainingNew,
  computeRemainingAfterGuess,
  getRemainingWordInfo,
  buildSetterRemainingBoxState,
  buildGuesserRemainingBoxState
};
