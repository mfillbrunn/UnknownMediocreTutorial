PowerEngine.register("revealGreen", {

  role: "guesser",
  tooltip: {
  title: this.label,
  desc: "One letter in the current secret is revealed - but the setter can still change it."
  }


  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_revealGreen";
    btn.className = "power-btn";
    btn.textContent = "Reveal Green";
    this.buttonEl = btn;

    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_REVEAL_GREEN" });
  },

  // ⭐ LIVE visual feedback when the power triggers
  effects: {
  onPowerUsed({ pos, letter }) {
    toast(`Green revealed: Position ${pos + 1} = ${letter}`);

    const key = document.querySelector(`[data-key="${letter}"]`);
    if (key) key.classList.add("power-green-highlight");

    // Render pattern with special styling
    const st = window.state; // your client keeps state globally
    st.revealGreenInfo = { pos, letter }; // update local state for re-renders

    renderPatternInto(
      $("knownPatternGuesser"),
      $("knownPatternGuesser").textContent.split(" "),
      st.revealGreenInfo
    );
  }
},

patternEffects(state, isSetterView, pattern) {
  if (isSetterView) return;
  if (!state.revealGreenInfo) return;

  // Nothing needed here — we render visually in updateUI
}

});
