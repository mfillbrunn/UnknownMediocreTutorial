// /game-engine/powers.js

/**
 * Choose up to 4 letters from previous guesses.
 */
export function pickReusableLetters(history, max = 4) {
  const letters = new Set();

  for (const h of history) {
    for (const ch of h.guess.toUpperCase()) {
      letters.add(ch);
    }
  }

  const arr = Array.from(letters);
  if (arr.length <= max) return arr;

  const chosen = [];
  while (chosen.length < max && arr.length > 0) {
    const idx = Math.floor(Math.random() * arr.length);
    chosen.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return chosen;
}

/**
 * Apply "Blue Mode" (confuse colors)
 */
export function confuseColors(fb) {
  return fb.map(tile =>
    tile === "🟩" || tile === "🟨" ? "🟦" : tile
  );
}

/**
 * Apply Count-only feedback (hide tile positions)
 */
export function countOnly(fb) {
  return ["?", "?", "?", "?", "?"];
}

/**
 * Count greens/yellows
 */
export function getCounts(fb) {
  return {
    greens: fb.filter(x => x === "🟩").length,
    yellows: fb.filter(x => x === "🟨").length
  };
}
