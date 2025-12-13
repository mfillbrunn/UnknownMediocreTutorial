PowerEngine.register("suggestGuess", {
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_suggestGuess";
    btn.className = "power-btn";
    btn.textContent = "Suggest Guess";

    $("guesserPowerContainer").appendChild(btn);
    this.buttonEl = btn;

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_SUGGEST_GUESS" });
    };
  },

  effects: {
    onPowerUsed() {
      this.buttonEl.disabled = true;
      this.buttonEl.classList.add("power-used");
    }
  }
});
