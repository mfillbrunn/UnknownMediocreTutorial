PowerEngine.register("suggestGuess", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.suggestGuess.label,
    desc: window.POWER_METADATA.suggestGuess.desc
  },
  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("suggestGuess", "Suggest Guess");
    this.buttonEl = btn;
        $("guesserPowerContainer").appendChild(wrapper)

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_SUGGEST_GUESS" });
    };
  },

  effects: {
    onPowerUsed() {
  const btn = this.buttonEl;
  if (!btn) return;         
  btn.disabled = true;
  btn.classList.add("power-used");
    }
  }
});

// --------------------------------------------------
// Suggest Guess — info badge
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  const meta = POWER_METADATA.suggestGuess;

  // Power has been used this match
  if (!state.powers?.suggestGuessUsed) return null;

  // -----------------------------
  // GUESSER: show word
  // -----------------------------
  if (role === state.guesser) {
    const guess = window.uiState?.suggestedGuess;
    if (!guess) return null;

    return {
      id: "suggestGuess-word",
      emoji: meta.emoji,
      text: `${meta.label}: ${guess}`,
      color: meta.color,
      priority: 15,
      screen: "guesser",
      details: meta.desc
    };
  }

  // -----------------------------
  // SETTER: show generic notice
  // -----------------------------
  if (role === state.setter) {
    return {
      id: "suggestGuess-used",
      emoji: meta.emoji,
      text: `${meta.label} used`,
      color: meta.color,
      priority: 40,
      screen: "setter",
      details: "The guesser received a suggested guess."
    };
  }

  return null;
});

