PowerEngine.register("confuseColors", {

  role: "setter",
tooltip: {
    title: window.POWER_METADATA.confuseColors.label,
    desc: window.POWER_METADATA.confuseColors.desc
  },

  renderButton(roomId) {
  const { wrapper, btn } =    PowerEngine.createPowerButton("confuseColors", window.POWER_METADATA.confuseColors.label);
  this.wrapperEl = wrapper;  
  this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      sendGameAction({ type: "USE_CONFUSE_COLORS" });
    };
  },

  uiEffects(state, role) {
    // Nothing extra needed.
  },

  historyEffects(entry, isSetter) {
    if (!entry.fbGuesser) return;
    if (!entry.confuseApplied) return;

    entry.fbGuesser = entry.fbGuesser.map(tile => {
      if (tile === "🟪") return tile;
      if (tile === "🟩" || tile === "🟨") return "🟦";
      return tile;
    });
  }
});

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.confuseColorsActive) return null;
  const meta = POWER_METADATA.confuseColors;
  return {
    id: "confuseColors",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});

