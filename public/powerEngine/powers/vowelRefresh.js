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
// --------------------------------------------------
// Vowel Refresh — info badge (both players)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.vowelRefreshActive) return null;

  const vowels = window.uiState?.vowelRefreshVowels;
  if (!Array.isArray(vowels) || vowels.length === 0) {
    return {
      id: "vowelRefresh-used",
      emoji: POWER_METADATA.vowelRefresh.emoji,
      text: `${POWER_METADATA.vowelRefresh.label} used but to no effect`,
      color: POWER_METADATA.vowelRefresh.color,
      priority: 30,
      screen: "both",
      details: POWER_METADATA.vowelRefresh.desc
    };
  }

  return {
    id: "vowelRefresh-detail",
    emoji: POWER_METADATA.vowelRefresh.emoji,
    text: `${POWER_METADATA.vowelRefresh.label}: ${vowels.join(", ")}`,
    color: POWER_METADATA.vowelRefresh.color,
    priority: 30,
    screen: "both",
    details: `Reset vowels: ${vowels.join(", ")}`
  };
});
