PowerEngine.register("blindGuess", {
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Blind Guess";

    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_BLIND_GUESS" });
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
    // Blind Guess affects guesser UI only
    if (role !== state.guesser) return;

    if (state.powers?.blindGuessActive) {
      document.body.classList.add("blind-guess");
    } else {
      document.body.classList.remove("blind-guess");
    }
  }
});
