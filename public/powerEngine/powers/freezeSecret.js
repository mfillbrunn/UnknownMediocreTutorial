PowerEngine.register("freezeSecret", {

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_freezeSecret";
    btn.className = "power-btn";
    btn.textContent = "Freeze Secret";
    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_FREEZESECRET" });
  },

  uiEffects(state, role) {
    if (!state.powers.freezeActive) return;

    $("newSecretInput").disabled = true;
    $("submitSetterNewBtn").disabled = true;

    const bar = $("turnIndicatorSetter");
    bar.className = "turn-indicator frozen-turn";
    bar.textContent = "SECRET FROZEN";
  }
});
