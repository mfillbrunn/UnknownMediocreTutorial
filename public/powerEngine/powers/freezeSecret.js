PowerEngine.register("freezeSecret", {

  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.freezeSecret.label,
    desc: window.POWER_METADATA.freezeSecret.desc
  },
  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("freezeSecret", "Freeze Secret");
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
        $("guesserPowerContainer").appendChild(wrapper)


    btn.onclick = () => {
      sendGameAction({ type: "USE_FREEZE_SECRET" });
    };
  },

  // This handles ongoing frozen UI
 uiEffects(state, role) {
  if (role !== state.setter) return;

  const frozen =
    state.powers.freezeActive &&
    state.phase === "normal" &&
    state.turn === state.setter;
},

  // ⭐ ADD THIS — visual confirmation when clicked
  effects: {
    onPowerUsed(data) {
      if (data.type !== "freezeSecret") return;
      const btn = PowerEngine.powers.freezeSecret.buttonEl;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  }
});

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.freezeActive) return null;
  const meta = POWER_METADATA.freezeSecret;
  return {
    id: "freezeSecret",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});

