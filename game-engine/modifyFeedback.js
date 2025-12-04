// /game-engine/modifyFeedback.js
//
// Server-side feedback transformer to support powers like:
// revealGreen, confuseColors (blue), countOnly, freezeSecret, hide tile, etc.

function modifyFeedback(fbGuesser, state, guess) {
  let result = [...fbGuesser];
  let extraInfo = null;

  // --- Reveal Green ---
  if (state.powers.revealGreenUsed && state.powers.revealGreenPos != null) {
    const i = state.powers.revealGreenPos;
    result[i] = "🟩";
  }

  // --- Confuse Colors (blue mode) ---
  if (state.powers.confuseColorsActive) {
    result = result.map(v => (v === "🟨" || v === "⬛" ? "🟦" : v));
  }

  // --- Count Only ---
  if (state.powers.countOnlyActive) {
    const greens = result.filter(v => v === "🟩").length;
    const yellows = result.filter(v => v === "🟨").length;
    return {
      fbGuesser: ["❓","❓","❓","❓","❓"],
      extraInfo: { greens, yellows }
    };
  }

  return { fbGuesser: result, extraInfo };
}

module.exports = { modifyFeedback };
