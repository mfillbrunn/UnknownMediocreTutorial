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

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.rouletteSecretActive) return null;

  const meta = POWER_METADATA.rouletteSecret;

  return {
    id: "rouletteSecret",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
