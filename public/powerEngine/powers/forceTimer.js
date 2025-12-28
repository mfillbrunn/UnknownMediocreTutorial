PowerEngine.register("forceTimer", {
  role: "guesser",
  tooltip: {
  title: this.label,
  desc: "The setter has only a short time to submit a new secret."
},

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Force Timer";

    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      console.log("[CLIENT] ForceTimer button clicked");
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_FORCE_TIMER" });
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
