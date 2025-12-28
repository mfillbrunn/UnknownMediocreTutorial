PowerEngine.register("stealthGuess", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.stealthGuess.label,
    desc: window.POWER_METADATA.stealthGuess.desc
  },
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
  const btn = this.buttonEl;
  if (!btn) return;         // ← prevents crash
  btn.disabled = true;
  btn.classList.add("power-used");
    }
  }
});
