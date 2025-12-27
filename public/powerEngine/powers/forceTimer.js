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

  effects: {
    onPowerUsed() {
      const btn = this.buttonEl;
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  },

  uiEffects(state, role) {
    // Countdown display (derived from server deadline)
    if (state.powers.forceTimerActive && state.powers.forceTimerDeadline) {
      const bar = $("turnIndicatorSetter");
      const remaining = Math.max(
        0,
        Math.ceil((state.powers.forceTimerDeadline - Date.now()) / 1000)
      );

      bar.textContent = `TIME LEFT: ${remaining}s`;
      bar.classList.add("your-turn");
    }
  }
});
