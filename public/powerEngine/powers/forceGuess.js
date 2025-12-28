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
