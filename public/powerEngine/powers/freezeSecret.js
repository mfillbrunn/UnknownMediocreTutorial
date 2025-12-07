PowerEngine.register("freezeSecret", {
  uiEffects(state, role) {
    if (!state.powers.freezeActive) return;

    if (role === state.setter) {
      $("newSecretInput").disabled = true;
      $("submitSetterNewBtn").disabled = true;

      const bar = $("turnIndicatorSetter");
      bar.textContent = "SECRET FROZEN";
      bar.className = "turn-indicator frozen-turn";
    }
  }
});
