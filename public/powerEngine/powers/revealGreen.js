PowerEngine.register("revealGreen", {

  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.revealGreen.label,
    desc: window.POWER_METADATA.revealGreen.desc
  },


  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("revealGreen", "Sneak Letter");
    this.buttonEl = btn;
        $("guesserPowerContainer").appendChild(wrapper)

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

  // --------------------------------------------------
// Reveal Green — info badge (guesser-only)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  // Only show if the reveal exists
  const info = state.revealGreenInfo;
  if (!info) return null;

  // Only the guesser should see it
  if (role !== state.guesser) return null;

  const meta = POWER_METADATA.revealGreen;
  const { pos, letter } = info;

  return {
    id: "revealGreen",
    emoji: meta.emoji,
    text: `${meta.label}: position ${pos + 1} = ${letter}`,
    color: meta.color,
    priority: 10,
    screen: "guesser",
    details: meta.desc
  };
});


});
