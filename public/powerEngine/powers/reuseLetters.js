PowerEngine.register("reuseLetters", {
  label: "Reuse Letters",
  once: true,

  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.setter &&
      state.turn === state.setter &&
      !state.powerUsedThisTurn &&
      !state.powers.reuseLettersUsed &&
      state.history.length > 0
    );
  },

  activate(roomId) {
    window.sendGameAction(roomId, { type: "USE_REUSELETTERS" });
  },

  renderButton(roomId) {
    const c = $("setterPowerContainer");
    const btn = document.createElement("button");
    btn.id = "power_reuseLetters";
    btn.className = "power-btn";
    btn.textContent = this.label;
    c.appendChild(btn);
  }
});
