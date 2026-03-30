PowerEngine.register("suggestSecret", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.suggestSecret.label,
    desc: window.POWER_METADATA.suggestSecret.desc
  },
  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("suggestSecret", window.POWER_METADATA.suggestSecret.label);
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction({ type: "USE_SUGGEST_SECRET" });
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

// --------------------------------------------------
// Suggest Secret — info badge (reverse of Suggest Guess)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  const meta = POWER_METADATA.suggestSecret;

  // Power used this match?
  if (!state.powers?.suggestSecretActive) return null;
  // -----------------------------
  // SETTER: show word
  // -----------------------------
  if (role === "setter") {
    const secret = window.uiState?.suggestedSecret;
    return {
      id: "suggestSecret-word",
      emoji: meta.emoji,
      text: `${meta.label}: ${secret}`,
      color: meta.color,
      priority: 15,
      screen: "setter",
      details: meta.desc
    };
  }

  // -----------------------------
  // GUESSER: generic notice only
  // -----------------------------
  if (role ==="guesser") {
    return {
      id: "suggestSecret-used",
      emoji: meta.emoji,
      text: `${meta.label} used`,
      color: meta.color,
      priority: 40,
      screen: "guesser",
      details: "The setter received a suggested secret."
    };
  }

  return null;
});

