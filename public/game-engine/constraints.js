// /public/game-engine/constraints.js
// Safe client-side game logic

/**
 * Compute known pattern based on green tiles only.
 */
export function getKnownPattern(history, fbKey = "fbGuesser") {
  let result = ["-", "-", "-", "-", "-"];

  if (!history || history.length === 0) return result.join("");

  for (const h of history) {
    const fb = h[fbKey];
    if (!fb) continue;

    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟩") {
        result[i] = h.guess[i].toUpperCase();
      }
    }
  }

  return result.join("");
}

/**
 * Letters known to be in the word (safe because server reveals 🟨 and 🟩 info)
 */
export function getMustContain(history) {
  const set = new Set();
  if (!history || history.length === 0) return [];

  for (const h of history) {
    for (let i = 0; i < 5; i++) {
      if (h.fb[i] === "🟩" || h.fb[i] === "🟨") {
        set.add(h.guess[i].toUpperCase());
      }
    }
  }
  return Array.from(set);
}

export function spacedPattern(p) {
  return p.split("").join(" ");
}
