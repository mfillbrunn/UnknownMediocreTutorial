PowerEngine.register("forceTimer", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.forceTimer.label,
    desc: window.POWER_METADATA.forceTimer.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("forceTimer", window.POWER_METADATA.forceTimer.label);
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

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
  const overlay = $("forceTimerOverlay");
  if (!overlay) return;

  const active =
    role === "guesser" &&
    !!state.powers?.forceTimerActive &&
    !!state.powers?.forceTimerDeadline;

  if (!active) {
    overlay.classList.add("hidden");
    clearInterval(this._forceTimerTick);
    this._forceTimerTick = null;
    return;
  }

  overlay.classList.remove("hidden");

  const deadline = state.powers.forceTimerDeadline;
  const numberEl = $("forceTimerNumber");

  const render = () => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (numberEl) numberEl.textContent = remaining;
    overlay.classList.toggle("force-timer-urgent", remaining <= 5);
    if (remaining <= 0) {
      clearInterval(this._forceTimerTick);
      this._forceTimerTick = null;
    }
  };

  render();
  if (!this._forceTimerTick) {
    this._forceTimerTick = setInterval(render, 250);
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
