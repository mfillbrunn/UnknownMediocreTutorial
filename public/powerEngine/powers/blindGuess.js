PowerEngine.register("blindGuess", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.blindGuess.label,
    desc: window.POWER_METADATA.blindGuess.desc
  },

  renderButton(roomId) {
   const { wrapper, btn } =    PowerEngine.createPowerButton("blindGuess", "Blind Guess");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_BLIND_GUESS" });
    };
  },

  effects: {
    onPowerUsed() {
      if (!this.buttonEl) return;
      this.buttonEl.disabled = true;
      this.buttonEl.classList.add("power-used");
    }
  },

  uiEffects(state, role) {
    // Blind Guess affects guesser UI only
    if (role !== state.guesser) return;

    if (state.powers?.blindGuessActive) {
      document.body.classList.add("blind-guess");
    } else {
      document.body.classList.remove("blind-guess");
    }
  }
});

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.blindGuessActive) return null;

  const meta = POWER_METADATA.blindGuess;

  return {
    id: "blindGuess",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
