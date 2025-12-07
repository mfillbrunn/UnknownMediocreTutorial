PowerEngine.register("revealGreen", {

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_revealGreen";
    btn.className = "power-btn";
    btn.textContent = "Reveal Green";
    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_REVEALGREEN" });
  },

  historyEffects(entry, isSetter) {
    if (isSetter) return;
    const st = window.state;

    if (!st?.revealGreenInfo) return;

    const { pos } = st.revealGreenInfo;
    entry.fbGuesser[pos] = "🟩";
  },

  patternEffects(state, isSetterView, pattern) {
    if (isSetterView) return;
    if (!state.revealGreenInfo) return;

    const { pos, letter } = state.revealGreenInfo;
    pattern[pos] = letter.toUpperCase();
  }
});
