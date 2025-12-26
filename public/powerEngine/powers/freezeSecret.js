PowerEngine.register("freezeSecret", {

  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_freezeSecret";
    btn.className = "power-btn";
    btn.textContent = "Freeze Secret";

    $("guesserPowerContainer").appendChild(btn);
    this.buttonEl = btn;

    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_FREEZE_SECRET" });
    };
  },

  // This handles ongoing frozen UI
  uiEffects(state, role) {
    if (!state.powers.freezeActive) return;
    const bar = $("turnIndicatorSetter");
    bar.className = "turn-indicator frozen-turn";
    bar.textContent = "SECRET FROZEN";
  },

  // ⭐ ADD THIS — visual confirmation when clicked
  effects: {
    onPowerUsed(data) {
      if (data.type !== "freezeSecret") return;
      const btn = PowerEngine.powers.freezeSecret.buttonEl;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  }
});
