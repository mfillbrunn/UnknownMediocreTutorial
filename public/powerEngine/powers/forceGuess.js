PowerEngine.register("forceGuess", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.forceGuess.label,
    desc: window.POWER_METADATA.forceGuess.desc
  },


  renderButton(roomId) {
  const { wrapper, btn } =    PowerEngine.createPowerButton("forceGuess", "Force Guess");
  this.wrapperEl = wrapper;  
  this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);


    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction({ type: "USE_FORCE_GUESS" });
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
  const opts = state.powers?.forceGuessOptions;
  if (!opts) return null;

  const meta = POWER_METADATA.forceGuess;

  return {
  id: "forceGuess",
  emoji: meta.emoji,
  text: `${meta.label}: ${opts
    .map(formatforceGuessOption)
    .join(" OR ")}`,
  color: meta.color,
  priority: 20,
  screen: "both"
};
});
