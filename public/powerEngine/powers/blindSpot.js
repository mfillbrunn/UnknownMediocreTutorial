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
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  },

  historyEffects(entry, isSetter) {
    if (typeof entry.blindSpotApplied === "number") {
      const i = entry.blindSpotApplied;

      if (!isSetter && entry.fbGuesser) {
        entry.fbGuesser[i] = "🟪";
      }

      if (isSetter && entry.fb) {
        entry.fb[i] = "🟪";
      }
    }
  }
});
