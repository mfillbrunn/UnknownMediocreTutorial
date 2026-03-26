const { scoreGuess } = require("../game-engine/validation");
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
  const lastIdx = history.length - 1;
  if (lastIdx < 0) return null;

  const current = computeRemainingAfterIndexFromState(lastIdx, state, allowedSecrets);

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

  return {
    current,
    old: oldCount,
    new: newCount
  };
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
  if (!info || info.current == null) {
    return { visible: false };
  }

  const hasDraft = typeof draftSecret === "string" && draftSecret.length === 5;

  let isConsistent = true;
  if (hasDraft) {
    isConsistent = isConsistentWithHistory(state.history, draftSecret, state);
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

module.exports = {
  computeRemainingAfterIndexFromState,
  computeRemainingNew,
  getRemainingWordInfo,
  buildSetterRemainingBoxState
};
