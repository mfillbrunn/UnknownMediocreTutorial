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
      if (!this.buttonEl) return;
      this.buttonEl.disabled = true;
      this.buttonEl.classList.add("power-used");
    }
  },

  uiEffects(state, role) {
    // Only setter sees timer UI
    if (role !== state.setter) return;

    const bar = $("turnIndicatorSetter");

    // Clear any normal state first
    bar.classList.remove("your-turn", "wait-turn");

    if (state.powers.forceTimerActive && state.powers.forceTimerDeadline) {
      const remaining = Math.max(
        0,
        Math.ceil((state.powers.forceTimerDeadline - Date.now()) / 1000)
      );

      bar.textContent = `TIME LEFT: ${remaining}s`;
      bar.classList.add("your-turn");

      // Disable setter inputs while timer runs
      const newBtn = $("submitSetterNewBtn");
      const sameBtn = $("submitSetterSameBtn");
      const input = $("newSecretInput");

      if (newBtn) newBtn.disabled = false;
      if (sameBtn) sameBtn.disabled = false;
      if (input) input.disabled = false;
    }
  }
});
