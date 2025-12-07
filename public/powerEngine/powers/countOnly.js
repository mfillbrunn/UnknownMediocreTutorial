// /public/powerEngine/powers/countOnly.js

PowerEngine.register("countOnly", {

  // -------- UI EFFECTS (optional overlay hiding) --------
  uiEffects(state, role) {
    if (!state.powers.countOnlyActive) return;

    if (role === state.guesser) {
      $("knownPatternGuesser").textContent = "?????";
      $("mustContainGuesser").textContent = "hidden";
    }
  },

  // -------- HISTORY MODIFICATIONS --------
  historyEffects(entry, isSetter) {
    if (!entry.extraInfo) return;   // countOnly data comes from server
    if (isSetter) return;           // setter should still see everything

    // Hide position feedback:
    entry.fbGuesser = ["❓","❓","❓","❓","❓"];
    // BUT keep extraInfo (greens, yellows count)
  },

  // -------- PATTERN MODIFICATION (constraints.js) --------
  patternEffects(state, isSetterView, pattern) {
    if (!state.powers.countOnlyActive) return;
    if (isSetterView) return;   // setter sees true greens

    // Completely hide pattern
    for (let i = 0; i < 5; i++) {
      pattern[i] = "?";
    }
  },

  // -------- MUST CONTAIN MODIFICATION (constraints.js) --------
  mustContainEffects(state, arr) {
    if (!state.powers.countOnlyActive) return;

    // Empty must contain list
    arr.length = 0;
  }
});
