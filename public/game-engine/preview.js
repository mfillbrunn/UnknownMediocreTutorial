// /public/game-engine/preview.js
//
// Predicts the feedback the guesser will receive
// if the setter submits a given secret.

import { scoreGuess } from "./scoring.js";

export function predictFeedback(proposedSecret, pendingGuess) {
  if (!proposedSecret || !pendingGuess) return null;
  if (proposedSecret.length !== 5 || pendingGuess.length !== 5) return null;

  return scoreGuess(proposedSecret.toLowerCase(), pendingGuess.toLowerCase());
}
