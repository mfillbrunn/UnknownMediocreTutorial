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
      formatted.actorRole === viewerRole ? "You: " : "Opp: ";
    const roleClass = formatted.actorRole ? ` log-power-${formatted.actorRole}` : "";
    return {
      type: "power",
      cssClass: roleClass,
      text: `${who}${formatted.text}`
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
      // Field Report's 3 conditions are randomized per round and have no
      // other persistent home now that the on-screen info badge that used
      // to show them was removed (it just duplicated the quest card's own
      // progress otherwise) -- surfaced once here instead, right where the
      // round starts. Only known for the round in progress: past rounds'
      // conditions aren't archived in state.matchRounds, so this can't be
      // reconstructed for completed rounds.
      const quest = state.powers?.quest;
      if (isLiveRound && quest?.type === "FIELDREPORT" && Array.isArray(quest.conditions)) {
        const conditionList = typeof window.formatFieldReportCondition === "function"
          ? quest.conditions.map(window.formatFieldReportCondition).join(" • ")
          : "";
        if (conditionList) {
          entries.push({ type: "power", cssClass: "", text: `Quest: Field Report — ${conditionList}` });
        }
      }
      // Roles can swap between rounds, so "you"/"the setter" has to be
      // resolved per-round rather than from the viewer's current role.
      const isSetterThisRound = myId != null && setterIdThisRound === myId;
      const viewerRole = isSetterThisRound ? "setter" : "guesser";
      let guessNumber = 0;

      (history || []).forEach(entry => {
        if (!entry?.guess) return;
        guessNumber++;
        const guessHidden = isLiveRound && !isSetterThisRound && state.powers?.stealthGuessActive;
        // Total Blackout hides the guesser's entire history board (see
        // history.js's buildHistoryRenderState returning [] while
        // blindGuessActive) -- the log lists the same round's guessed
        // words in plain text, so without this it's an easy way to read
        // right through the blackout. Redact every guess in the live
        // round the same way, for as long as the board itself is blanked.
        const blackedOut = isLiveRound && state.powers?.blindGuessActive;
        const guessDisplay = blackedOut
          ? `<span class="log-blackout-word">${"█".repeat(entry.guess.length)}</span>`
          : (guessHidden ? "?????" : entry.guess.toUpperCase());
        // Simultaneous-phase secret submission and a locked secret both
        // belong to this same turn/entry as the guess -- folded onto its
        // row as a short suffix instead of their own separate rows, so
        // one turn always reads as exactly one compact log row rather
        // than spilling across two or three in the small always-visible
        // box (see .sidebar-log-notes-box).
        let text = `${guessNumber}: ${guessDisplay}`;
        if (entry.phase === "simultaneous") {
          text += isSetterThisRound ? " · set" : " · opp set";
        }
        if (entry.secretLocked) text += " 🔒";
        entries.push({ type: "action", text });

        (entry.powerEvents || []).forEach(evt => {
          const pe = powerEntry(evt, viewerRole);
          if (pe) entries.push(pe);
        });

        // Recon Sweep result: private to the guesser (safeState strips this
        // field for the setter entirely), so it only ever renders here.
        if (entry.letterProbeResult && viewerRole === "guesser") {
          const { count, distinctTested, letters } = entry.letterProbeResult;
          const meta = window.POWER_METADATA?.letterProbe;
          entries.push({
            type: "power",
            cssClass: " log-power-guesser",
            text: `${meta?.label || "Letter Scan"}: ${count}/${distinctTested} (${letters})`
          });
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
    // Log is a floating panel (see toggleActionLog below) toggled open/
    // closed from the header -- rendered unconditionally (not gated on
    // its own .hidden class) so it's already current the instant it's
    // opened instead of showing stale content from before the toggle.
    const container = document.getElementById(`actionLog${roleId}`);
    if (!container) return;

    const entries = buildLog(state, myRole);

    // updateUI() calls this on every keystroke/tick, not just when a new
    // line actually appears (the setter's copy is now always visible in
    // the sidebar, not just opened on demand -- see setter-sidebar.js), so
    // without this the whole panel was tearing itself down and re-running
    // the scroll-to-bottom animation dozens of times a second, which read
    // as the entire log "rewriting itself" instead of one new line
    // quietly appending. Skip the rebuild entirely when nothing changed.
    const signature = JSON.stringify(entries);
    if (container.dataset.logSignature === signature) return;
    const grew = entries.length > Number(container.dataset.logCount || 0);
    container.dataset.logSignature = signature;
    container.dataset.logCount = String(entries.length);

    container.innerHTML =
      entries.map(e => `<div class="log-entry log-${e.type}${e.cssClass || ""}">${e.text}</div>`).join("") +
      '<div class="log-scroll-anchor"></div>';

    // Only autoscroll when a line was actually added -- an edit to an
    // existing line (e.g. a power result filling in) shouldn't yank the
    // view back down if the player had scrolled up to read earlier lines.
    if (grew) {
      container.querySelector(".log-scroll-anchor")?.scrollIntoView({ behavior: "smooth" });
    }
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
