PowerEngine.register("forceGuess", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.forceGuess.label,
    desc: window.POWER_METADATA.forceGuess.desc
  },


  renderButton(roomId) {
  const { wrapper, btn } =    PowerEngine.createPowerButton("forceGuess", "Force Guess");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);


    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_FORCE_GUESS" });
    };
  },

  effects: {
    onPowerUsed() {
      if (!this.buttonEl) return;
      this.buttonEl.disabled = true;
      this.buttonEl.classList.add("power-used");
    }
  }
});

InfoBadgeEngine.register((state, role) => {
  const fg = state.powers?.forcedGuess;
  if (!state.powers?.forceGuessActive) return null;

  const meta = POWER_METADATA.forceGuess;

  return {
    id: "forceGuess",
    emoji: meta.emoji,
    text: `${meta.label}: ${formatForceGuessOption(fg)}`,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
