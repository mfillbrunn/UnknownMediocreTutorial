// /public/powerEngine/powers/revealGreen.js

PowerEngine.register("revealGreen", {
  
  // When showing history, force the revealed green
  historyEffects(entry, isSetter) {
    if (isSetter) return;
    if (!entry || !entry.fbGuesser) return;

    // The position comes from state.revealGreenInfo, NOT from the entry
    const st = window.state;
    if (!st?.revealGreenInfo) return;

    const { pos, letter } = st.revealGreenInfo;
    if (pos == null) return;

    entry.fbGuesser[pos] = "🟩";
  },

  // When rendering the pattern at top
  patternEffects(state, isSetterView, pattern) {
    if (isSetterView) return;
    if (!state.revealGreenInfo) return;

    const { pos, letter } = state.revealGreenInfo;
    pattern[pos] = letter.toUpperCase();
  }
});
