PowerEngine.register("stealthGuess", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.stealthGuess.label,
    desc: window.POWER_METADATA.stealthGuess.desc
  },
  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("stealthGuess", "Stealth Guess");
    this.buttonEl = btn;
        $("guesserPowerContainer").appendChild(wrapper)

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_STEALTH_GUESS" });
    };
  },

  effects: {
    onPowerUsed() {
  const btn = this.buttonEl;
  if (!btn) return;         // ← prevents crash
  btn.disabled = true;
  btn.classList.add("power-used");
    }
  }
});

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.stealthGuessActive) return null;

  const meta = POWER_METADATA.stealthGuess;

  return {
    id: "stealthGuess",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
