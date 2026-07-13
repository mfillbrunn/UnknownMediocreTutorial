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

      (entry.powerEvents || []).forEach(evt => {
        const formatted = window.formatPowerEvent?.(evt);
        if (!formatted) return;
        const who =
          formatted.actorRole == null ? "" :
          formatted.actorRole === myRole ? "You: " : "Opponent: ";
        entries.push({
          type: "power",
          text: `${formatted.emoji ? formatted.emoji + " " : ""}${who}${formatted.text}`
        });
      });

      if (entry.secretLocked) {
        entries.push({ type: "lock", text: "🔒 Secret locked" });
      }
    });

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
