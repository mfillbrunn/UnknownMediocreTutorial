// /public/game-engine/constraints.js

/**
 * Compute known pattern from history.
 *
 * isSetterView = true → use fb (true feedback)
 * isSetterView = false → use fbGuesser
 *
 * Returns "A--E-" form string.
 */
export function getPattern(state, isSetterView) {
  const pattern = ["-", "-", "-", "-", "-"];
  if (!state?.history?.length) return pattern.join("");

  for (const h of state.history) {
    const fbArr = isSetterView ? h.fb : h.fbGuesser;
    if (!fbArr) continue;

    for (let i = 0; i < 5; i++) {
      if (fbArr[i] === "🟩") {
        pattern[i] = h.guess[i].toUpperCase();
      }
    }
  }

  return pattern.join("");
}

/**
 * Compute letters that MUST appear
 * Uses TRUE feedback only — fb
 */
export function getMustContainLetters(state) {
  const set = new Set();
  if (!state?.history?.length) return [];

  for (const h of state.history) {
    for (let i = 0; i < 5; i++) {
      if (h.fb[i] === "🟩" || h.fb[i] === "🟨") {
        set.add(h.guess[i].toUpperCase());
      }
    }
  }

  return [...set];
}

/**
 * Format "A--E-" as "A - - E -"
 */
export function formatPattern(patternString) {
  return patternString.split("").join(" ");
}
