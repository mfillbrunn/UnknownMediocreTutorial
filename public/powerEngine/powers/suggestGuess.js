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
