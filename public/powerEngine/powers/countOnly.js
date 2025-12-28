PowerEngine.register("countOnly", {

  role: "setter",
tooltip: {
    title: window.POWER_METADATA.countOnly.label,
    desc: window.POWER_METADATA.countOnly.desc
  },


  renderButton(roomId) {
 const { wrapper, btn } =    PowerEngine.createPowerButton("countOnly", "Count Only");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);


    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_COUNT_ONLY" });
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
