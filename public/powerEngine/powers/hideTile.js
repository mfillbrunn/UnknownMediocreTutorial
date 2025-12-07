
PowerEngine.register("hideTile", {
  label: "Hide Tile",
  once: false,

  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.setter &&
      state.turn === state.setter &&
      !state.powerUsedThisTurn
    );
  },

  activate(roomId) {
    window.sendGameAction(roomId, { type: "USE_HIDETILE" });
  },

  renderButton(roomId) {
    const c = $("setterPowerContainer");
    const btn = document.createElement("button");
    btn.id = "power_hideTile";
    btn.className = "power-btn";
    btn.textContent = this.label;
    c.appendChild(btn);
  }
});
