// /public/ui/constraints.js

/**
 * Compute known pattern from history.
 * Setter view uses actual fb; guesser view uses fbGuesser.
 *
 * Returns a string like "A--E-".
 */
export function getPattern(state, isSetterView) {
  let res = ["-", "-", "-", "-", "-"];

  if (!state || !state.history || !state.history.length) {
    return res.join("");
  }

  for (const h of state.history) {
    const fbArray = isSetterView ? h.fb : h.fbGuesser;
    if (!fbArray) continue;

    for (let i = 0; i < 5; i++) {
      if (fbArray[i] === "🟩") {
        res[i] = h.guess[i].toUpperCase();
      }
    }
  }

  return res.join("");
}

/**
 * Compute the list of letters that must be contained (based on true fb).
 */
export function getMustContainLetters(state) {
  const s = new Set();
  if (!state || !state.history || !state.history.length) return [];

  for (const h of state.history) {
    for (let i = 0; i < 5; i++) {
      if (h.fb[i] === "🟩" || h.fb[i] === "🟨") {
        s.add(h.guess[i].toUpperCase());
      }
    }
  }
  return Array.from(s);
}

/**
 * Format the pattern with spaces: "A - - E -"
 */
export function formatPattern(pattern) {
  return pattern.split("").join(" ");
}
