const { scoreGuess } = require("../game-engine/scoring");
const { isConsistentWithHistory } = require("../game-engine/history");


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

function computeRemainingNew(secretWord, state, allowedSecrets) {
  if (!state || !Array.isArray(state.history)) return null;
  if (!Array.isArray(allowedSecrets) || allowedSecrets.length === 0) return null;
  if (!secretWord || typeof secretWord !== "string") return null;

  const guess = state.pendingGuess;
  if (!guess || guess.includes("?")) return null;

  const fb = scoreGuess(secretWord.toUpperCase(), guess.toUpperCase());

  const newHistoryEntry = {
    guess,
    fb,
    ignoreConstraints: false
  };

  const testHistory = [...state.history, newHistoryEntry];

  let count = 0;
  for (const word of allowedSecrets) {
    if (isConsistentWithHistory(testHistory, word, state)) {
      
      count++;
    }
  }

  return count;
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

  const history = Array.isArray(state.history) ? state.history : [];

  // Stealth Guess hides the guess/feedback text from the setter, but the
  // remaining-word count was still being computed from the real,
  // unmasked history — silently leaking the same information back
  // through the numbers instead. Hide the count for that one round too.
  if (history[history.length - 1]?.stealthApplied) {
    return { current: null, old: -1, new: -1, hiddenByStealth: true };
  }

  // Compute current remaining — full list if no history yet
  let current;
  if (history.length === 0) {
    current = allowedSecrets.length;
  } else {
    current = computeRemainingAfterIndexFromState(history.length - 1, state, allowedSecrets);
  }

  let oldCount = -1;
  let newCount = -1;

  const guess = state.pendingGuess;
  const guessIsComplete = !!guess && !guess.includes("?");

  if (guessIsComplete) {
    oldCount = computeRemainingNew(state.secret, state, allowedSecrets);
    if (typeof draftSecret === "string" && draftSecret.length === 5) {
      newCount = computeRemainingNew(draftSecret, state, allowedSecrets);
    }
  }

  return { current, old: oldCount, new: newCount };
}

function buildSetterRemainingBoxState(state, viewerId, allowedSecrets, draftSecret = null) {
  if (
    !state ||
    state.phase === "simultaneous" ||
    state.phase === "lobby" ||
    state.phase === "gameOver"
  ) {
    return { visible: false };
  }

  if (viewerId !== state.setter) {
    return { visible: false };
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
      highlightNew: false
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

  return {
    visible: true,
    current: info.current,
    old: hasOld ? info.old : null,
    new: hasNew ? info.new : null,
    isConsistent,
    highlightOld: hasOld && hasNew && info.old > info.new,
    highlightNew: hasOld && hasNew && info.new > info.old
  };
}

// Wiretap power: the guesser sees the same "how many secrets are still
// possible" count the setter sees — the number of dictionary words still
// consistent with all feedback so far. This is derived purely from
// committed history (not the pending guess), so it's stable across the
// guesser's turn and identical to the setter's `current`. It's not a leak:
// the guesser can already compute it themselves from the feedback they see.
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

  const history = Array.isArray(state.history) ? state.history : [];

  let current;
  if (history.length === 0) {
    current = secrets.length;
  } else {
    current = computeRemainingAfterIndexFromState(history.length - 1, state, secrets);
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
