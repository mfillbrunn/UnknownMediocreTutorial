PowerEngine.register("revealGreen", {
  historyEffects(entry, isSetter) {
    if (isSetter) return;
    if (entry.revealGreenPos == null) return;

    entry.fbGuesser[entry.revealGreenPos] = "🟩";
  }
  patternEffects(state, isSetterView, pattern) {
  if (!state.powers.revealGreenUsed) return;
  if (isSetterView) return;

  const pos = state.powers.revealGreenPos;
  const letter = state.secret[pos].toUpperCase();
  pattern[pos] = letter;
}

});
