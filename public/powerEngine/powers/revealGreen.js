PowerEngine.register("revealGreen", {

  // ⭐ REQUIRED: Only the GUESSER can activate this power
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_revealGreen";
    btn.className = "power-btn";
    btn.textContent = "Reveal Green";

    // Goes in the Guesser’s power container
    $("guesserPowerContainer").appendChild(btn);

    // ⭐ REQUIRED so powerEngine can enable/disable/mark-used
    this.buttonEl = btn;

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_REVEALGREEN" });
  },

  // When applied in history, show the forced green tile
  historyEffects(entry, isSetter) {
    if (isSetter) return;

    const st = window.state;
    if (!st?.revealGreenInfo) return;

    const { pos } = st.revealGreenInfo;
    entry.fbGuesser[pos] = "🟩";
  },

  // Force pattern to show the revealed letter
  patternEffects(state, isSetterView, pattern) {
    if (isSetterView) return;
    if (!state.revealGreenInfo) return;

    const { pos, letter } = state.revealGreenInfo;
    pattern[pos] = letter.toUpperCase();
  }
});
