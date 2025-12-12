PowerEngine.register("revealGreen", {

  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_revealGreen";
    btn.className = "power-btn";
    btn.textContent = "Reveal Green";
    this.buttonEl = btn;

    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_REVEALGREEN" });
  },

  // ⭐ LIVE visual feedback when the power triggers
  effects: {
    onPowerUsed({ pos, letter }) {
      toast(`Green revealed: Position ${pos + 1} = ${letter}`);

      // highlight keyboard key
      const key = document.querySelector(`[data-key="${letter}"]`);
      if (key) key.classList.add("power-green-highlight");

      // force immediate pattern update on screen
      const patEl = $("knownPatternGuesser");
      const pat = patEl.textContent.split(" ");
      pat[pos] = letter.toUpperCase();
      patEl.textContent = pat.join(" ");
    }
  },

 // ⭐ Pattern update used by guesser’s constraint UI
  patternEffects(state, isSetterView, pattern) {
    if (isSetterView) return;
    if (!state.revealGreenInfo) return;

    const { pos, letter } = state.revealGreenInfo;
    pattern[pos] = letter.toUpperCase();
  }
});
