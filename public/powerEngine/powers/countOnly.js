PowerEngine.register("countOnly", {
  uiEffects(state, role) {
    if (role !== state.guesser) return;
    if (!state.powers.countOnlyActive) return;

    $("knownPatternGuesser").textContent = "?????";
    $("mustContainGuesser").textContent = "hidden";
  },

  historyEffects(entry, isSetter) {
    if (!entry.extraInfo) return;
    if (isSetter) return;

    entry.fbGuesser = ["❓","❓","❓","❓","❓"];
  }
  patternEffects(state, isSetterView, pattern) {
  if (!state.powers.countOnlyActive && !state.powers.countOnlyUsed) return;
  if (isSetterView) return; // setter still sees greens

  // hide everything
  for (let i = 0; i < 5; i++) pattern[i] = "?";
},

mustContainEffects(state, arr) {
  if (!state.powers.countOnlyActive && !state.powers.countOnlyUsed) return;
  return arr.length = 0;
}

});
