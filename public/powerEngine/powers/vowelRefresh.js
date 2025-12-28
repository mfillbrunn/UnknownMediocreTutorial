// /powers/powers/vowelRefresh.js
PowerEngine.register("vowelRefresh", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.vowelRefresh.label,
    desc: window.POWER_METADATA.vowelRefresh.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("vowelRefresh", "Vowel Refresh");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);
    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_VOWEL_REFRESH" });
    };
  },
 uiEffects(state, role) {
    if (!this.buttonEl) return;

    // Hide if this power isn't active this match
    if (!state.activePowers.includes("vowelRefresh")) {
      this.buttonEl.style.display = "none";
      return;
    }

    // Show only to setter
    if (role !== state.setter) {
      this.buttonEl.style.display = "none";
      return;
    }

    this.buttonEl.style.display = "";

    // Enable only when allowed
    const used = state.powers.vowelRefreshUsed;
    const turn = state.turn === state.setter;
    const phase = state.phase === "normal";

    this.buttonEl.disabled = used || !turn || !phase;
    this.buttonEl.classList.toggle("disabled-btn", this.buttonEl.disabled);
  },
  historyEffects(entry, isSetter) {
  },

  keyboardEffects(state, role, keyEl, letter) {
  }
});
