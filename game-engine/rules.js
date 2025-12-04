// /game-engine/rules.js

import { confuseColors, countOnly, getCounts } from "./powers.js";

/**
 * Apply power-based transformations to feedback.
 *
 * Returns:
 * {
 *   fbGuesser: [...],  // what guesser sees
 *   extraInfo: {...}   // for count-only, the green/yellow totals
 * }
 */
export function applyFeedbackPowers(fb, powers) {

  // COUNT-ONLY overrides everything
  if (powers.countOnlyActive) {
    return {
      fbGuesser: countOnly(fb),
      extraInfo: getCounts(fb)
    };
  }

  // CONFUSE-COLORS (Blue Mode)
  if (powers.confuseColorsActive) {
    return {
      fbGuesser: confuseColors(fb),
      extraInfo: null
    };
  }

  // Default case — no power modifies feedback
  return {
    fbGuesser: fb,
    extraInfo: null
  };
}
