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
});
