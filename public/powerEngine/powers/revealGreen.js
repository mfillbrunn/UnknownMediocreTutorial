PowerEngine.register("revealGreen", {

  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.revealGreen.label,
    desc: window.POWER_METADATA.revealGreen.desc
  },


  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("revealGreen", "Sneak Letter");
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
        $("guesserPowerContainer").appendChild(wrapper)

    btn.onclick = () =>
      sendGameAction({ type: "USE_REVEAL_GREEN" });
  },

  effects: {
  onPowerUsed({ pos, letter }) {
    toast(`Green revealed: Position ${pos + 1} = ${letter}`);

    const key = document.querySelector(`[data-key="${letter}"]`);
    if (key) key.classList.add("power-green-highlight");
  }
}
});


  // --------------------------------------------------
// Reveal Green — info badge (guesser-only)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  // Only show if the reveal exists
  const info = state.revealGreenInfo;
  if (!state.powers?.revealGreenActive) return null;

  const meta = POWER_METADATA.revealGreen;
  const { pos, letter } = info;

  return {
    id: "revealGreen",
    emoji: meta.emoji,
    text: `${meta.label}: position ${pos + 1} = ${letter}`,
    color: meta.color,
    priority: 10,
    screen: "both",
    details: meta.desc
  };
});
