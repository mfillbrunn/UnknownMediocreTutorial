PowerEngine.register("confuseColors", {
  label: "Blue Mode",
  once: true,

  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.setter &&
      state.turn === state.setter &&
      !state.powerUsedThisTurn &&
      !state.powers.confuseColorsUsed
    );
  },

  activate(roomId) {
    window.sendGameAction(roomId, { type: "USE_CONFUSECOLORS" });
  },

  renderButton(roomId) {
    const c = $("setterPowerContainer");
    const btn = document.createElement("button");
    btn.id = "power_confuseColors";
    btn.className = "power-btn";
    btn.textContent = this.label;
    c.appendChild(btn);
  }
});
