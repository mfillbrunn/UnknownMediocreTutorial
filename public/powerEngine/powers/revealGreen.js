PowerEngine.register("revealGreen", {
  historyEffects(entry, isSetter) {
    if (isSetter) return;
    if (entry.revealGreenPos == null) return;

    entry.fbGuesser[entry.revealGreenPos] = "🟩";
  }
});
