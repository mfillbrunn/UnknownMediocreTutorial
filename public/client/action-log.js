// client/action-log.js — vanilla JS port of ActionLog.jsx

(function () {
  // A power event is colored by which role it belongs to (the role that
  // used it), not by the current viewer's own screen — otherwise an
  // opponent's power looks identical to your own in the log.
  function powerEntry(evt, viewerRole) {
    const formatted = window.formatPowerEvent?.(evt);
    if (!formatted) return null;
    const who =
      formatted.actorRole == null ? "" :
      formatted.actorRole === viewerRole ? "You: " : "Opponent: ";
    const roleClass = formatted.actorRole ? ` log-power-${formatted.actorRole}` : "";
    return {
      type: "power",
      cssClass: roleClass,
      text: `${formatted.emoji ? formatted.emoji + " " : ""}${who}${formatted.text}`
    };
  }

  function buildLog(state, myRole) {
    if (!state) return [];
    const entries = [];
    const myId = typeof myUserId === "function" ? myUserId() : null;

    entries.push({ type: "round", text: "Game start" });

    // Completed rounds are archived (and state.history is wiped) at each
    // round boundary, so pull them from state.matchRounds too — otherwise
    // the log only ever shows the round currently in progress.
    const rounds = Array.isArray(state.matchRounds) ? state.matchRounds : [];

    function appendRound(history, setterIdThisRound, roundNumber, isLiveRound) {
      if (roundNumber > 0) {
        entries.push({ type: "round", text: `Round ${roundNumber + 1}` });
      }
      // Roles can swap between rounds, so "you"/"the setter" has to be
      // resolved per-round rather than from the viewer's current role.
      const isSetterThisRound = myId != null && setterIdThisRound === myId;
      const viewerRole = isSetterThisRound ? "setter" : "guesser";

      (history || []).forEach(entry => {
        if (!entry?.guess) return;
        const guessHidden = isLiveRound && !isSetterThisRound && state.powers?.stealthGuessActive;
        entries.push({ type: "action", text: `Inspector: ${guessHidden ? "?????" : entry.guess.toUpperCase()}` });
        if (entry.phase === "simultaneous") {
          entries.push({ type: "action", text: isSetterThisRound ? "Secret submitted" : "Spy submitted secret" });
        }

        (entry.powerEvents || []).forEach(evt => {
          const pe = powerEntry(evt, viewerRole);
          if (pe) entries.push(pe);
        });

        // Recon Sweep result: private to the guesser (safeState strips this
        // field for the setter entirely), so it only ever renders here.
        if (entry.letterProbeResult && viewerRole === "guesser") {
          const { count, distinctTested, letters } = entry.letterProbeResult;
          const meta = window.POWER_METADATA?.letterProbe;
          const verb = count === 1 ? "is" : "are";
          entries.push({
            type: "power",
            cssClass: " log-power-guesser",
            text: `${meta?.emoji ? meta.emoji + " " : ""}You: ${meta?.label || "Recon Sweep"}: ${count}/${distinctTested} ${verb} in the secret (${letters})`
          });
        }

        if (entry.secretLocked) {
          entries.push({ type: "lock", text: "🔒 Secret locked" });
        }
      });

      return viewerRole;
    }

    rounds.forEach((round, idx) => {
      appendRound(round.history, round.setter, idx, false);
    });
    const liveViewerRole = appendRound(state.history, state.setter, rounds.length, true);

    // Powers used mid-turn are only attached to a history entry once that
    // guess/decision resolves. Surface them the moment they're used instead
    // of making the player wait for the turn to finish — once the entry
    // finalizes, this live buffer is cleared and the authoritative version
    // (with any result learned since) takes its place.
    const live = Array.isArray(window._livePowerEvents) ? window._livePowerEvents : [];
    live.forEach(evt => {
      const pe = powerEntry(evt, liveViewerRole);
      if (pe) entries.push(pe);
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
      entries.map(e => `<div class="log-entry log-${e.type}${e.cssClass || ""}">${e.text}</div>`).join("") +
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
