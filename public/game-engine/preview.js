// preview.js — NON-MODULE VERSION

// scoreGuess is now loaded BEFORE this file
window.predictFeedback = function (proposedSecret, pendingGuess) {
  if (!proposedSecret || !pendingGuess) return null;
  if (proposedSecret.length !== 5 || pendingGuess.length !== 5) return null;

  return window.scoreGuess(
    proposedSecret.toLowerCase(),
    pendingGuess.toLowerCase()
  );
}

window.predictFeedbackIncomplete = function (proposedSecret, pendingGuess) {
  if (!proposedSecret || !pendingGuess) return null;
  const letterslength= proposedSecret.length;
  return window.scoreGuessIncomplete(proposedSecret.toLowerCase(),pendingGuess.toLowerCase(), letterslength);
};
