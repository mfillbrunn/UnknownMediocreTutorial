// /game-engine/rules.js
// CLEAN VERSION: server should NOT handle power feedback here anymore.
// All feedback modification now happens inside modifyFeedback.js.

function applyFeedbackPowers(fb, powers) {
  // This function is kept only for backward compatibility
  // but no longer transforms feedback. All transformations
  // (count-only, confuse colors, reveal green, etc.)
  // are handled inside /game-engine/modifyFeedback.js.

  return {
    fbGuesser: fb,
    extraInfo: null
  };
}

module.exports = { applyFeedbackPowers };
