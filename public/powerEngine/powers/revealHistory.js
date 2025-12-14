PowerEngine.register("revealHistory", {
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Reveal Old Secret";
    this.buttonEl = btn;

    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      if (btn.disabled) return; // ensure safety
      sendGameAction(roomId, { type: "USE_REVEAL_HISTORY" });
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
