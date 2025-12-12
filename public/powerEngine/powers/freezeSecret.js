PowerEngine.register("freezeSecret", {

  // ⭐ REQUIRED: This is a GUESSER power
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_freezeSecret";
    btn.className = "power-btn";
    btn.textContent = "Freeze Secret";

    // Add to the Guesser’s power area
    $("guesserPowerContainer").appendChild(btn);

    // ⭐ REQUIRED for engine: track reference to this button
    this.buttonEl = btn;

  btn.onclick = () =>{
  sendGameAction(roomId, { type: "USE_FREEZESECRET" });
},

  // When active, this power affects the setter’s ability to change secret
  uiEffects(state, role) {
    if (!state.powers.freezeActive) return;

    // Freeze secret input for setter
    $("newSecretInput").disabled = true;
    $("submitSetterNewBtn").disabled = true;

    // Change setter turn bar to frozen state
    const bar = $("turnIndicatorSetter");
    bar.className = "turn-indicator frozen-turn";
    bar.textContent = "SECRET FROZEN";
  }
});
