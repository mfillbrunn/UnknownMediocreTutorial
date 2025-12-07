PowerEngine.register("countOnly", {
  label: "Count Only",
  once: true,

  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.setter &&
      state.turn === state.setter &&
      !state.powerUsedThisTurn &&
      !state.powers.countOnlyUsed
    );
  },

  activate(roomId) {
    window.sendGameAction(roomId, { type: "USE_COUNTONLY" });
  },

  renderButton(roomId) {
    const c = $("setterPowerContainer");
    const btn = document.createElement("button");
    btn.id = "power_countOnly";
    btn.className = "power-btn";
    btn.textContent = this.label;
    c.appendChild(btn);
  }
});
