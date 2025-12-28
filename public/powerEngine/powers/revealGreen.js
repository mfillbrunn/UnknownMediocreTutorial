PowerEngine.register("revealGreen", {

  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.revealGreen.label,
    desc: window.POWER_METADATA.revealGreen.desc
  },


  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("revealGreen", "Sneak Letter");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

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
