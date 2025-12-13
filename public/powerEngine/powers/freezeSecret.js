PowerEngine.register("freezeSecret", {

  // This is a GUESSER power
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_freezeSecret";
    btn.className = "power-btn";
    btn.textContent = "Freeze Secret";

    $("guesserPowerContainer").appendChild(btn);

    this.buttonEl = btn;

    // FIX 1: Properly scoped onclick handler
    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_FREEZE_SECRET" });
    };
  },

  uiEffects(state, role) {
    if (!state.powers.freezeActive) return;

    // Disable setter input while frozen
    $("newSecretInput").disabled = true;
    $("submitSetterNewBtn").disabled = true;

    const bar = $("turnIndicatorSetter");
    bar.className = "turn-indicator frozen-turn";
    bar.textContent = "SECRET FROZEN";
  }
});
