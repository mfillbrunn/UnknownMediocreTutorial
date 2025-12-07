PowerEngine.register("countOnly", {

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_countOnly";
    btn.className = "power-btn";
    btn.textContent = "Count Only";

    $("setterPowerContainer").appendChild(btn);
    btn.onclick = () => sendGameAction(roomId, { type: "USE_COUNTONLY" });
  },

  uiEffects(state, role) {
    if (role !== state.guesser) return;
    if (!state.powers.countOnlyActive) return;

    $("knownPatternGuesser").textContent = "?????";
    $("mustContainGuesser").textContent = "hidden";
  },

  historyEffects(entry, isSetter) {
    if (!entry.extraInfo) return;
    if (isSetter) return;

    entry.fbGuesser = ["❓","❓","❓","❓","❓"];
  },

  patternEffects(state, isSetterView, pattern) {
    if (!state.powers.countOnlyActive) return;
    if (isSetterView) return;

    for (let i = 0; i < 5; i++) pattern[i] = "?";
  },

  mustContainEffects(state, arr) {
    if (!state.powers.countOnlyActive) return;
    arr.length = 0;
  }
});
