PowerEngine.register("freezeSecret", {

  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.freezeSecret.label,
    desc: window.POWER_METADATA.freezeSecret.desc
  },
  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("freezeSecret", "Freeze Secret");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);


    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_FREEZE_SECRET" });
    };
  },

  // This handles ongoing frozen UI
 uiEffects(state, role) {
  if (role !== state.setter) return;

  const frozen =
    state.powers.freezeActive &&
    state.phase === "normal" &&
    state.turn === state.setter;

  const bar = $("turnIndicatorSetter");
  if (frozen) {
    bar.className = "turn-indicator frozen-turn";
    bar.textContent = "SECRET FROZEN";
  }
}
,

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
