const { scoreGuess } = require("../game-engine/scoring");
const { isConsistentWithHistory } = require("../game-engine/history");
const { guesserVisibleHistoryCount } = require("./delayedFeedback");
const { getCoverAnalysis, getCandidateRemainingCount } = require("./coverStrength");

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

// The Secretkeeper's Keep/New remaining-word-count comparison (formerly
// getRemainingWordInfo + the bulk of buildSetterRemainingBoxState below)
// has been removed on purpose -- the setter no longer sees a numeric hint
// for how many candidate secrets Keep vs New would leave. See
// buildSetterRemainingBoxState.

function buildSetterRemainingBoxState() {
  return { visible: false };
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
  buildSetterRemainingBoxState,
  buildGuesserRemainingBoxState
};
