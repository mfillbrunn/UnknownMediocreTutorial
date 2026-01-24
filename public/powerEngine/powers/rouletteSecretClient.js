// /public/powers/rouletteSecretClient.js

PowerEngine.register("rouletteSecret", {
  role: "guesser",

  tooltip: {
    title: window.POWER_METADATA.rouletteSecret.label,
    desc: window.POWER_METADATA.rouletteSecret.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } =
      PowerEngine.createPowerButton("rouletteSecret", "Secret Roulette");

    this.wrapperEl = wrapper;
    this.buttonEl = btn;

    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction({ type: "USE_ROULETTE_SECRET" });
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
