PowerEngine.register("stealthGuess", {
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Stealth Guess";
    this.buttonEl = btn;

    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_STEALTH_GUESS" });
    };
  },

  effects: {
    onPowerUsed() {
      this.buttonEl.disabled = true;
      this.buttonEl.classList.add("power-used");
    }
  }
});
