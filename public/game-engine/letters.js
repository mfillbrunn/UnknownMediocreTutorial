// letters.js — NON-MODULE VERSION

window.getUsedLetters = function (history) {
  const set = new Set();
  if (!history) return set;

  for (const h of history) {
    for (const ch of h.guess.toUpperCase()) {
      set.add(ch);
    }
  }
  return set;
};

window.getLastFeedback = function (history) {
  if (!history || history.length === 0) return null;
  return history[history.length - 1];
};
