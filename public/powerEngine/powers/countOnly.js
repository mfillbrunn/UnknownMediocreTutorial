PowerEngine.register("countOnly", {

  // ⭐ REQUIRED: This is a SETTER power (setter presses the button)
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_countOnly";
    btn.className = "power-btn";
    btn.textContent = "Count Only";

    // Add to the Setter's UI container
    $("setterPowerContainer").appendChild(btn);

    // ⭐ REQUIRED for PowerEngine disabling + used logic
    this.buttonEl = btn;

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_COUNTONLY" });
  },

  // Guesser sees a modified UI when power is active
  uiEffects(state, role) {
    if (role !== state.guesser) return;
    if (!state.powers.countOnlyActive) return;

    $("knownPatternGuesser").textContent = "?????";
    $("mustContainGuesser").textContent = "hidden";
  },

  // Hide feedback from the guesser
  historyEffects(entry, isSetter) {
    if (isSetter) return;
    if (!entry.extraInfo) return;

    entry.fbGuesser = ["❓","❓","❓","❓","❓"];
  },

  // Pattern hidden from guesser while active
  patternEffects(state, isSetterView, pattern) {
    if (isSetterView) return;
    if (!state.powers.countOnlyActive) return;

    for (let i = 0; i < 5; i++) pattern[i] = "?";
  },

  // Must-contain list hidden from guesser
  mustContainEffects(state, arr) {
    if (!state.powers.countOnlyActive) return;
    arr.length = 0;
  }
});
