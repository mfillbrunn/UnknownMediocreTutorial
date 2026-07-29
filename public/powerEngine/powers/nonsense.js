PowerEngine.register("nonsense", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.nonsense.label,
    desc: window.POWER_METADATA.nonsense.desc
  },

  renderButton(roomId) {
   const { wrapper, btn } =    PowerEngine.createPowerButton("nonsense", window.POWER_METADATA.nonsense.label);
   this.wrapperEl = wrapper; 
   this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction({ type: "USE_NONSENSE" });
    };
  },

  effects: {
    onPowerUsed() {
      if (!this.buttonEl) return;
      this.buttonEl.disabled = true;
      this.buttonEl.classList.add("power-used");
    }
  },

  uiEffects(state, role) {
    if (role !== "setter") return;
    if (state.powers?.nonsenseActive) {
      document.body.classList.add("nonsense");
    } else {
      document.body.classList.remove("nonsense");
    }
  }
});

// nonsenseActive/nonsenseLastTurn (server-set) only cover ~1 of the
// setter's own turns after use before clearing -- easy to miss now that
// Log (not Info) is the default tab, since by the time a player switches
// over to check Info the window's often already gone. state.history still
// has this round's nonsense powerEvent (see logPowerUse.js) for as long
// as the round itself lasts, so fall back to that: once used, this stays
// visible in Info for the rest of the round instead of disappearing after
// one turn.
InfoBadgeEngine.register((state, role) => {
  const usedThisRound = (state.history || []).some(entry =>
    (entry.powerEvents || []).some(evt => evt.id === "nonsense")
  );
  if (!state.powers?.nonsenseActive && !state.powers?.nonsenseLastTurn && !usedThisRound) return null;

  const meta = POWER_METADATA.nonsense;

  return {
    id: "nonsense",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
