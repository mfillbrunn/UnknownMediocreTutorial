PowerEngine.register("forceGuess", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.forceGuess.label,
    desc: window.POWER_METADATA.forceGuess.desc
  },


  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Force Guess";

    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(btn);

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
