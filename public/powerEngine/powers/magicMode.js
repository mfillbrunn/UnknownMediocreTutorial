// /powers/powers/magicMode.js
PowerEngine.register("magicMode", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.magicMode.label,
    desc: window.POWER_METADATA.magicMode.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("magicMode", window.POWER_METADATA.magicMode.label);
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
        $("guesserPowerContainer").appendChild(wrapper)

    btn.onclick = () => {
      sendGameAction({ type: "USE_MAGIC_MODE" });
    };
  }
});


InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.magicModeActive) return null;
  const meta = POWER_METADATA.magicMode;
  return {
    id: "magicMode",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
