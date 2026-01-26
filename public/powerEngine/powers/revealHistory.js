PowerEngine.register("revealHistory", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.revealHistory.label,
    desc: window.POWER_METADATA.revealHistory.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("revealHistory", window.POWER_METADATA.revealHistory.label);
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
        $("guesserPowerContainer").appendChild(wrapper)

    btn.onclick = () => {
      if (btn.disabled) return; // ensure safety
      sendGameAction({ type: "USE_REVEAL_HISTORY" });
    };
  },

  effects: {
    onPowerUsed() {
      const btn = this.buttonEl;
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  }
});

// --------------------------------------------------
// Reveal History — info badge (both players)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  const meta = POWER_METADATA.revealHistory;

  // Power must have been used
  if (!state.powers?.revealHistoryActive) return null;

  // Find the most recent history entry with a revealed secret
  const revealedEntry = state.powers.revealHistoryPending.toUpperCase();

  return {
    id: "revealHistory",
    emoji: meta.emoji,
    text: `${meta.label}: ${revealedEntry}`,
    color: meta.color,
    priority: 18,
    screen: "both",
    details: meta.desc
  };
});
