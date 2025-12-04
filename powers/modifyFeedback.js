// /game-engine/modifyFeedback.js
//
// Called inside server: applyFeedbackPowers()

export function modifyFeedback(fbGuesser, state, guess) {
  let result = [...fbGuesser];

  // --- Reveal Green
  if (state.powers.revealGreenUsed && state.powers.revealGreenPos != null) {
    const i = state.powers.revealGreenPos;
    result[i] = "🟩";
  }

  // --- Confuse Colors (blue mode)
  if (state.powers.confuseColorsActive) {
    result = result.map(v => v === "🟨" || v === "⬛" ? "🟦" : v);
  }

  // --- Count Only Mode
  if (state.powers.countOnlyActive) {
    const greens = result.filter(v => v === "🟩").length;
    const yellows = result.filter(v => v === "🟨").length;

    return {
      fbGuesser: ["❓","❓","❓","❓","❓"],
      extraInfo: { greens, yellows }
    };
  }

  return { fbGuesser: result, extraInfo: null };
}
