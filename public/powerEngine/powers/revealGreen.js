PowerEngine.register("revealGreen", {
  label: "Reveal Green",
  once: true,

  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.guesser &&
      state.turn === state.guesser &&
      !state.powerUsedThisTurn &&
      !state.powers.revealGreenUsed &&
      state.secret
    );
  },

  activate(roomId) {
    sendGameAction(roomId, { type: "USE_REVEALGREEN" });
  },

  effects: {
    onPowerUsed({ pos, letter }) {
      toast(`Green revealed: ${letter} at ${pos + 1}`);
    }
  },

  renderButton() {
    const c = $("guesserPowerContainer");
    const btn = document.createElement("button");
    btn.id = "power_revealGreen";
    btn.className = "power-btn";
    btn.textContent = this.label;
    c.appendChild(btn);
  }
});
