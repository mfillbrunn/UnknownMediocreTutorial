PowerEngine.register("blindSpot", {
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Blind Spot";
    this.buttonEl = btn;

    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_BLIND_SPOT" });
    };
  },

  effects: {
    onPowerUsed(data) {
  const btn = this.buttonEl;
  if (!btn) return;         // ← prevents crash
  btn.disabled = true;
  btn.classList.add("power-used");
    }
  },

  historyEffects(entry, isSetter) {
    if (entry.blindSpotApplied != null) {
      if (entry.fbGuesser && typeof entry.blindSpotApplied === "number") {
        entry.fbGuesser[entry.blindSpotApplied] = "⬛";
      }
    }
  }
});
