PowerEngine.register("confuseColors", {
  uiEffects(state, role) {
    // nothing UI-only needed
  },

  historyEffects(entry, isSetter) {
    if (!entry.fbGuesser) return;

    // Blue Mode:
    // Green & Yellow → Blue
    if (entry.confuseApplied) return;

    entry.fbGuesser = entry.fbGuesser.map(tile => {
      if (tile === "🟩" || tile === "🟨") return "🟦";
      return tile; // black stays black
    });

    entry.confuseApplied = true;
  }
});
