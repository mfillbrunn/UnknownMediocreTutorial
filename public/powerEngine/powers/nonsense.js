PowerEngine.register("nonsense", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.nonsense.label,
    desc: window.POWER_METADATA.nonsense.desc
  },

  renderButton(roomId) {
   const { wrapper, btn } =    PowerEngine.createPowerButton("nonsense", "Nonsense Guess");
   this.wrapperEl = wrapper; 
   this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_NONSENSE" });
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
    if (role !== state.setter) return;
    if (state.powers?.nonsenseActive) {
      document.body.classList.add("nonsense");
    } else {
      document.body.classList.remove("nonsense");
    }
  }
});

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.nonsenseActive && !state.powers?.nonsenseLastTurn) return null;

  const meta = POWER_METADATA.nonsense;

  return {
    id: "nonsense",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
