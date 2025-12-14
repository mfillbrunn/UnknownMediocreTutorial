PowerEngine.register("revealHistory", {
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Reveal Old Secret";
    this.buttonEl = btn;

    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_REVEAL_HISTORY" });
    };
  },

  effects: {
    onPowerUsed() {
      this.buttonEl.disabled = true;
      this.buttonEl.classList.add("power-used");
    }
  }
});
