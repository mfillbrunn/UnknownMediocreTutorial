const { isConsistentWithHistory } = require("../game-engine/isConsistentWithHistory");
const { scoreGuess } = require("../game-engine/scoreGuess");

/**
 * Compute remaining valid secrets after applying history up to idx.
 * @param {number} idx
 * @param {object} state
 * @param {string[]} allowedSecrets
 * @returns {number}
 */
function computeRemainingAfterIndexFromState(idx, state, allowedSecrets) {
  if (!state || !Array.isArray(state.history)) return 0;
  if (!Array.isArray(allowedSecrets)) return 0;

  const partialHistory = state.history.slice(0, idx + 1);
  let count = 0;

  for (const word of allowedSecrets) {
    if (isConsistentWithHistory(partialHistory, word, state)) {
      count++;
    }
  }

  return count;
}

/**
 * Compute remaining valid secrets if the setter were to use `secretWord`
 * against the current pending guess.
 * @param {string} secretWord
 * @param {object} state
 * @param {string[]} allowedSecrets
 * @returns {number|null}
 */
function computeRemainingNew(secretWord, state, allowedSecrets) {
  if (
    !state ||
    !Array.isArray(state.history) ||
    !Array.isArray(allowedSecrets)
  ) {
    return null;
  }

  const guess = state.pendingGuess;
  if (!guess || guess.includes("?")) {
    return null;
  }

  const fb = scoreGuess(secretWord.toUpperCase(), guess.toUpperCase());

  const newHistoryEntry = {
    guess,
    fb,
    ignoreConstraints: false,
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

/**
 * Compute the setter's remaining-word info block.
 * This replaces the old client-side getRemainingWordInfo().
 * @param {object} state
 * @param {string[]} allowedSecrets
 * @param {string|null} draftSecret
 * @returns {{current:number, old:number, new:number}|null}
 */
function getRemainingWordInfo(state, allowedSecrets, draftSecret = null) {
  if (
    !state ||
    state.phase === "simultaneous" ||
    state.phase === "lobby" ||
    state.phase === "gameOver"
  ) {
    return null;
  }

  const lastIdx = state.history.length - 1;
  if (lastIdx < 0) return null;

  const current = computeRemainingAfterIndexFromState(
    lastIdx,
    state,
    allowedSecrets
  );

  let oldCount = -1;
  let newCount = -1;

  const guess = state.pendingGuess;
  const guessIsComplete = !!guess && !guess.includes("?");

  if (guessIsComplete) {
    oldCount = computeRemainingNew(state.secret, state, allowedSecrets);

    if (draftSecret && draftSecret.length === 5) {
      newCount = computeRemainingNew(draftSecret, state, allowedSecrets);
    }
  }

  return {
    current,
    old: oldCount,
    new: newCount,
  };
}

/**
 * Compute the full payload the client needs for the setter remaining box.
 * The client should only render this; it should not recompute it.
 * @param {object} state
 * @param {string} viewerRoleOrPlayerId
 * @param {string[]} allowedSecrets
 * @param {string|null} draftSecret
 * @returns {object}
 */
function buildSetterRemainingBoxState(
  state,
  viewerRoleOrPlayerId,
  allowedSecrets,
  draftSecret = null
) {
  if (
    !state ||
    state.phase === "simultaneous" ||
    state.phase === "lobby" ||
    state.phase === "gameOver"
  ) {
    return {
      visible: false,
      current: null,
      old: null,
      new: null,
      isConsistent: true,
      highlightOld: false,
      highlightNew: false,
    };
  }

  if (viewerRoleOrPlayerId !== state.setter) {
    return {
      visible: false,
      current: null,
      old: null,
      new: null,
      isConsistent: true,
      highlightOld: false,
      highlightNew: false,
    };
  }

  const info = getRemainingWordInfo(state, allowedSecrets, draftSecret);
  if (!info || info.current == null) {
    return {
      visible: false,
      current: null,
      old: null,
      new: null,
      isConsistent: true,
      highlightOld: false,
      highlightNew: false,
    };
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
    highlightNew: hasOld && hasNew && info.new > info.old,
  };
}

module.exports = {
  computeRemainingAfterIndexFromState,
  computeRemainingNew,
  getRemainingWordInfo,
  buildSetterRemainingBoxState,
};
