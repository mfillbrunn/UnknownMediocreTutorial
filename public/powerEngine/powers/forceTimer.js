PowerEngine.register("forceTimer", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.forceTimer.label,
    desc: window.POWER_METADATA.forceTimer.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("forceTimer", "Force Timer");
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      console.log("[CLIENT] ForceTimer button clicked");
      if (btn.disabled) return;
      sendGameAction({ type: "USE_FORCE_TIMER" });
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
  const bar = $("turnIndicatorSetter");
  if (!bar) return;

  // Always clean up first
  bar.classList.remove("force-timer");

  if (
    role === state.setter &&
    state.powers.forceTimerActive &&
    state.powers.forceTimerDeadline
  ) {
    const remaining = Math.max(
      0,
      Math.ceil((state.powers.forceTimerDeadline - Date.now()) / 1000)
    );

    bar.textContent = `⏱ ${remaining}s`;
    bar.classList.add("force-timer");
  }
}
});

  InfoBadgeEngine.register((state, role) => {
  const deadline = state.powers?.forceTimerDeadline;
  if (!state.powers?.forceTimerActive || !deadline) return null;

  // Show to BOTH players (it affects both)
  const meta = POWER_METADATA.forceTimer;

  const remaining = Math.max(
    0,
    Math.ceil((deadline - Date.now()) / 1000)
  );
  const timeText =
  remaining <= 10 ? `⚠ ${remaining}s` : `${remaining}s`;

  return {
    id: "forceTimer",
    emoji: meta.emoji,
    text: `${meta.label}: ${timeText}`,
    color: meta.color,
    priority: 1,          // very high priority
    screen: "both",
    details: meta.desc
  };
    });
