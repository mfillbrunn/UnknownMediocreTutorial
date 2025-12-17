// /public/powerEngine/powers/vowelRefresh.js
PowerEngine.register("vowelRefresh", {
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Vowel Refresh";
    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_VOWEL_REFRESH" });
    };
  },

  uiEffects(state, role) {
    if (!this.buttonEl) return;

    if (!state.activePowers.includes("vowelRefresh")) {
      this.buttonEl.style.display = "none";
      return;
    }

    if (role !== state.guesser) {
      this.buttonEl.style.display = "none";
      return;
    }

    this.buttonEl.style.display = "";

    const used = state.powers.vowelRefreshUsed;
    const turn = state.turn === state.guesser;
    const phase = state.phase === "normal";

    // Button enabled only when allowed
    this.buttonEl.disabled = used || !turn || !phase;
    this.buttonEl.classList.toggle("disabled-btn", this.buttonEl.disabled);
  },

  // No historyEffects: vowelRefresh does NOT modify feedback display
  historyEffects() {},

  // No keyboardEffects: keyboard.js handles vowel reset logic
  keyboardEffects() {}
});
