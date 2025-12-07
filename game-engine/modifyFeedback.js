// /game-engine/modifyFeedback.js
//
// Server-side feedback transformer supporting all powers:
// revealGreen, confuseColors (blue), countOnly, hideTile, reuseLetters, etc.

function modifyFeedback(rawFb, state, guess) {
  let fbGuesser = [...rawFb];
  let extraInfo = null;

  // --- Reveal Green ---
  if (state.powers.revealGreenUsed && state.powers.revealGreenPos != null) {
    const i = state.powers.revealGreenPos;
    fbGuesser[i] = "🟩";
  }

  // --- Hide Tile ---
  if (state.powers.hideTilePendingCount > 0) {
    // hide N tiles at random indices (once per feedback)
    const numToHide = state.powers.hideTilePendingCount;
    const hidden = new Set();
    while (hidden.size < numToHide) {
      hidden.add(Math.floor(Math.random() * 5));
    }
    state.currentHiddenIndices = Array.from(hidden);
    state.powers.hideTilePendingCount = 0; // consumed
  }

  // Apply hidden indices in fbGuesser
  if (state.currentHiddenIndices) {
    fbGuesser = fbGuesser.map((v, i) =>
      state.currentHiddenIndices.includes(i) ? "❓" : v
    );
  }

  // --- Confuse Colors (Blue Mode) ---
  if (state.powers.confuseColorsActive) {
    fbGuesser = fbGuesser.map(v => {
      if (v === "🟨" || v === "⬛") return "🟦"; // turn into blue
      return v;
    });
  }

  // --- Count Only ---
  if (state.powers.countOnlyActive) {
    const greens = fbGuesser.filter(v => v === "🟩").length;
    const yellows = fbGuesser.filter(v => v === "🟨").length;

    // Only show ? tiles + extra info
    return {
      fbGuesser: ["❓","❓","❓","❓","❓"],
      extraInfo: { greens, yellows }
    };
  }

  return { fbGuesser, extraInfo };
}

module.exports = { modifyFeedback };
