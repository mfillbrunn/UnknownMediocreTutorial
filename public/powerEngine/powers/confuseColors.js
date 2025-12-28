PowerEngine.register("confuseColors", {

  role: "setter",
tooltip: {
    title: window.POWER_METADATA.confuseColors.label,
    desc: window.POWER_METADATA.confuseColors.desc
  },

  renderButton(roomId) {
  const { wrapper, btn } =    PowerEngine.createPowerButton("confuseColors", "Blue Mode");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_CONFUSE_COLORS" });
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
