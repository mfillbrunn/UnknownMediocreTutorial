PowerEngine.register("hideTile", {

  role: "setter",
tooltip: {
    title: window.POWER_METADATA.hideTile.label,
    desc: window.POWER_METADATA.hideTile.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("hideTile", window.POWER_METADATA.hideTile.label);
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () =>
      sendGameAction({ type: "USE_HIDE_TILE" });
  },

  // Guesser sees hidden tiles in the history
  historyEffects(entry, isSetter) {
    if (isSetter) return;
    if (!entry.hiddenIndices) return;

    entry.hiddenIndices.forEach(idx => {
      entry.fbGuesser[idx] = "❓";
    });
  }
});

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.hideTileActive) return null;
  const meta = POWER_METADATA.hideTile;
  return {
    id: "hideTile",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
