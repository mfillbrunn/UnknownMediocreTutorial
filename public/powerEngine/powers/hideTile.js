PowerEngine.register("hideTile", {
  historyEffects(entry, isSetter) {
    if (isSetter) return;
    if (!entry.hiddenIndices) return;

    entry.fbGuesser = entry.fbGuesser.map((tile, i) =>
      entry.hiddenIndices.includes(i) ? "❓" : tile
    );
  }
});
