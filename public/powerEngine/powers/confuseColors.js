PowerEngine.register("confuseColors", {

  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_confuseColors";
    btn.className = "power-btn";
    btn.textContent = "Blue Mode";

    $("setterPowerContainer").appendChild(btn);

    this.buttonEl = btn;

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
      if (tile === "🟩" || tile === "🟨") return "🟦";
      return tile;
    });
  }
});
