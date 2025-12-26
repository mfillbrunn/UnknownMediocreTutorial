PowerEngine.register("freezeSecret", {

  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_freezeSecret";
    btn.className = "power-btn";
    btn.textContent = "Freeze Secret";

    $("guesserPowerContainer").appendChild(btn);
    this.buttonEl = btn;

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

    const keyboard = $("keyboardSetter");
  keyboard.classList.toggle("keyboard-frozen", frozen);

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
