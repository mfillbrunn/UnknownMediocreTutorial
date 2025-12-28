PowerEngine.register("confuseColors", {

  role: "setter",
tooltip: {
  title: this.label,
  desc: "Turns all green and yellow feedback blue for one round."
},

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
      if (tile === "🟪") return tile;
      if (tile === "🟩" || tile === "🟨") return "🟦";
      return tile;
    });
  }
});
