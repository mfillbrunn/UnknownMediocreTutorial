PowerEngine.register("forceGuess", {
  role: "setter",
  tooltip: {
  title: this.label,
  desc: "Forces guess to adhere to restrictions for a round."
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
