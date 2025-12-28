PowerEngine.register("revealHistory", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.revealHistory.label,
    desc: window.POWER_METADATA.revealHistory.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("revealHistory", "Reveal History");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

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
