PowerEngine.register("blindSpot", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.blindSpot.label,
    desc: window.POWER_METADATA.blindSpot.desc
  },


  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("blindSpot", "Blind Spot");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

       
    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_BLIND_SPOT" });
    };
  },

  effects: {
    onPowerUsed(data) {
      const btn = this.buttonEl;
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  }
});

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.blindSpotActive) return null;

  const meta = POWER_METADATA.blindSpot;

  return {
    id: "blindSpot",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});;
