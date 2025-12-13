PowerEngine.register("forceTimer", {
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Force Timer";
    this.buttonEl = btn;

    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_FORCE_TIMER" });
    };
  },

  uiEffects(state, role) {
    if (state.powers.forceTimerSetterPhase) {
      const remaining = ((state.powers.forceTimerDeadline - Date.now()) / 1000) | 0;
      $("turnIndicatorSetter").textContent = `TIMER: ${remaining}s`;
      $("turnIndicatorSetter").classList.add("your-turn");
    }
  },

  effects: {
    onPowerUsed() {
      this.buttonEl.disabled = true;
      this.buttonEl.classList.add("power-used");
    }
  }
});
