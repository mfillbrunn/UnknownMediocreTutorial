// client/action-log.js — vanilla JS port of ActionLog.jsx

(function () {
  function buildLog(state, myRole) {
    if (!state) return [];
    const entries = [];
    const isSetter = myRole === "setter";
    const history = state.history || [];

    entries.push({ type: "round", text: "Game start" });

    let prevRoundIdx = -1;
    history.forEach(entry => {
      if (!entry?.guess) return;
      const rIdx = entry.roundIndex ?? 0;
      if (rIdx !== prevRoundIdx) {
        prevRoundIdx = rIdx;
        if (rIdx > 0) entries.push({ type: "round", text: `Round ${rIdx + 1}` });
      }
      const guessHidden = !isSetter && state.powers?.stealthGuessActive;
      entries.push({ type: "action", text: `Inspector: ${guessHidden ? "?????" : entry.guess.toUpperCase()}` });
      if (entry.phase === "simultaneous") {
        entries.push({ type: "action", text: isSetter ? "Secret submitted" : "Spy submitted secret" });
      }
    });

    if (state.simultaneousAllWrong) {
      entries.push({ type: "lock", text: "🔒 Secret locked" });
    }

    const p = state.powers || {};
    if (p.freezeActive)               entries.push({ type: "power", text: "❄️ Lockdown active" });
    if (p.blindGuessActive)           entries.push({ type: "power", text: "🙈 Blind Guess active" });
    if (p.stealthGuessActive)         entries.push({ type: "power", text: "👻 Stealth Guess active" });
    if (p.rouletteSecretActive)       entries.push({ type: "power", text: "🎰 Break Cover active" });
    if (p.fakeFeedbackRound != null)  entries.push({ type: "power", text: "🎭 Falsify Intel active" });
    if (p.confuseColorsRound != null) entries.push({ type: "power", text: "📡 Jam Signals active" });
    if (p.blindSpotTile != null)      entries.push({ type: "power", text: "⬛ Blind Spot active" });
    if (p.magicModeRound != null)     entries.push({ type: "power", text: "✨ Magic Mode active" });
    if (p.forceTimerActive)           entries.push({ type: "power", text: "⏳ Time Pressure active" });
    if (p.assassinWordUsed)           entries.push({ type: "power", text: "☠️ Assassin Word set" });
    if (p.betMissActive)              entries.push({ type: "power", text: "🎯 Risky Maneuver active" });
    if (p.revealGreenUsed)            entries.push({ type: "power", text: "👁 Letter revealed" });
    if (p.forceGuessUsed)             entries.push({ type: "power", text: "🔫 Force a Move used" });
    if (p.nonsenseUsed)               entries.push({ type: "power", text: "🌀 Signal Scramble used" });

    return entries;
  }

  function renderActionLog(state, myRole) {
    if (!state || !myRole) return;
    const roleId = myRole === "setter" ? "Setter" : "Guesser";
    const container = document.getElementById(`actionLog${roleId}`);
    if (!container || container.classList.contains("hidden")) return;

    const entries = buildLog(state, myRole);
    container.innerHTML =
      entries.map(e => `<div class="log-entry log-${e.type}">${e.text}</div>`).join("") +
      '<div class="log-scroll-anchor"></div>';

    container.querySelector(".log-scroll-anchor")?.scrollIntoView({ behavior: "smooth" });
  }

  function toggleActionLog(role) {
    const roleId = role === "setter" ? "Setter" : "Guesser";
    const container = document.getElementById(`actionLog${roleId}`);
    const btn = document.getElementById(`actionLogBtn${roleId}`);
    if (!container) return;
    const isHidden = container.classList.toggle("hidden");
    btn?.classList.toggle("active", !isHidden);
    if (!isHidden) renderActionLog(window.state, role);
  }

  window.renderActionLog = renderActionLog;
  window.toggleActionLog = toggleActionLog;
})();
