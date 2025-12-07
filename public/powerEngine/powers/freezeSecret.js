PowerEngine.register("freezeSecret", {
  label: "Freeze Secret",
  once: true,

  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.guesser &&
      state.turn === state.guesser &&
      !state.powerUsedThisTurn &&
      !state.powers.freezeSecretUsed &&
      state.firstSecretSet
    );
  },

  activate(roomId) {
    sendGameAction(roomId, { type: "USE_FREEZESECRET" });
  },

  effects: {
    applyUI(state, myRole) {
      if (state.powers.freezeActive) {
        $("newSecretInput").disabled = true;
        $("submitSetterNewBtn").disabled = true;

        const bar = $("turnIndicatorSetter");
        bar.textContent = "SECRET FROZEN";
        bar.className = "turn-indicator frozen-turn";
      }
    },

    onPowerUsed() {
      toast("Guesser froze the secret");
    }
  },

  renderButton() {
    const c = $("guesserPowerContainer");
    const btn = document.createElement("button");
    btn.id = "power_freezeSecret";
    btn.className = "power-btn";
    btn.textContent = this.label;
    c.appendChild(btn);
  }
});
