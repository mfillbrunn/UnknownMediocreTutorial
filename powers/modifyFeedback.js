// /powers/modifyFeedback.js
// SERVER-SIDE — modifies feedback sent to the GUESSER
//
// These functions run after scoreGuess() inside finalizeFeedback().
// They convert the true feedback into masked or recolored versions,
// depending on which powers are active.
//

// Convert both greens and yellows to BLUE for guesser when confuseColors is active
function applyConfuseColors(fb) {
  return fb.map(tile =>
    (tile === "🟩" || tile === "🟨") ? "🟦" : tile
  );
}

// Replace all tiles with "?" and report counts separately
function applyCountOnly(fb) {
  return ["?", "?", "?", "?", "?"];
}

// Extract counts for count-only mode
function getCounts(fb) {
  return {
    greens: fb.filter(f => f === "🟩").length,
    yellows: fb.filter(f => f === "🟨").length
  };
}

/**
 * Main exported function:
 * Transform feedback for a GUESSER based on active powers.
 *
 * Returns:
 * {
 *   fbForGuesser: [...],   // tiles the guesser sees
 *   extraInfo: { ... }     // optional text info (green/yellow counts)
 * }
 */
function modifyFeedbackForGuesser(state, fb) {

  // COUNT-ONLY power (strongest override)
  if (state.powers.countOnlyActive) {
    const counts = getCounts(fb);
    return {
      fbForGuesser: applyCountOnly(fb),
      extraInfo: counts
    };
  }

  // CONFUSE-COLORS power (medium override)
  if (state.powers.confuseColorsActive) {
    return {
      fbForGuesser: applyConfuseColors(fb),
      extraInfo: null
    };
  }

  // No power active → normal feedback
  return {
    fbForGuesser: fb,
    extraInfo: null
  };
}

module.exports = {
  modifyFeedbackForGuesser
};
