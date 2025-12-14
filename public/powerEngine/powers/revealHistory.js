PowerEngine.register("revealHistory", {
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Reveal Old Secret";
    this.buttonEl = btn;

    $("guesserPowerContainer").appendChild(btn);

    // Disable until the rules say it's allowed
    const updateEnabledState = () => {
      const canUse = window.POWER_RULES.revealHistory.allowed(window.state, window.myRole);
      btn.disabled = !canUse;
      btn.classList.toggle("disabled-btn", !canUse);
    };

    // Run once on render
    updateEnabledState();

    btn.onclick = () => {
      // Safety check: never send if disallowed
      if (btn.disabled) return;

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
