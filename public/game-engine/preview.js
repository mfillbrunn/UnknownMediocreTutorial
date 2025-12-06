// preview.js — NON-MODULE VERSION

window.predictFeedback = function (proposedSecret, pendingGuess) {
  if (!proposedSecret || !pendingGuess) return null;
  if (proposedSecret.length !== 5 || pendingGuess.length !== 5) return null;

  // scoreGuess MUST be global (ensure scoring.js provides window.scoreGuess)
  return window.scoreGuess(
    proposedSecret.toLowerCase(),
    pendingGuess.toLowerCase()
  );
};
