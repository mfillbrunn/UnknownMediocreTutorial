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
    sendGameAction(roomId, { type: "USE_HIDETILE" });
  },

  effects: {
    onPowerUsed() {
      toast("Setter hid a tile");
    }
  },

  renderButton() {
    const c = $("setterPowerContainer");
    const btn = document.createElement("button");
    btn.id = "power_hideTile";
    btn.className = "power-btn";
    btn.textContent = this.label;
    c.appendChild(btn);
  }
});
