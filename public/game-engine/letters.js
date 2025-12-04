// /public/game-engine/letters.js

/**
 * Extract all letters that have been guessed so far.
 */
export function getUsedLetters(history) {
  const set = new Set();
  if (!history) return set;

  for (const h of history) {
    for (const ch of h.guess.toUpperCase()) {
      set.add(ch);
    }
  }
  return set;
}

/**
 * Extract last feedback for keyboard coloring.
 */
export function getLastFeedback(history) {
  if (!history || history.length === 0) return null;
  return history[history.length - 1];
}
