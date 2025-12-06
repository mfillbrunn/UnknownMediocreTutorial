// Load scoring
import { scoreGuess } from "./scoring.js";

// ⭐ Make scoreGuess available globally for UI preview logic
window.scoreGuess = scoreGuess;

// ⭐ This is the preview function used by updateSetterScreen()
window.predictFeedback = function (proposedSecret, pendingGuess) {

  if (!proposedSecret || !pendingGuess) return null;
  if (proposedSecret.length !== 5 || pendingGuess.length !== 5) return null;

  return window.scoreGuess(
    proposedSecret.toLowerCase(),
    pendingGuess.toLowerCase()
  );
};
