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
      // Field Report's 3 conditions refresh every turn (the 0-8 total
      // keeps accumulating, but which 3 conditions are "live" changes
      // each guess -- see questServer.js) and have no other persistent
      // home now that the on-screen info badge that used to show them was
      // removed. Only known for the round in progress: past rounds'
      // per-turn conditions aren't archived in state.matchRounds, so this
      // can't be reconstructed for completed rounds.
      const quest = state.powers?.quest;
      const isLiveFieldReport = isLiveRound && quest?.type === "FIELDREPORT";
      function pushConditionsLine(conditions) {
        const conditionList = Array.isArray(conditions) && typeof window.formatFieldReportCondition === "function"
          ? conditions.map(window.formatFieldReportCondition).join(" • ")
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
        // Logged BEFORE the guess it applied to -- the conditions that
        // were live are what the player was actually aiming for when
        // they made this guess.
        if (isLiveFieldReport) {
          pushConditionsLine(quest.conditionsHistory?.[guessNumber]);
        }
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

      // The not-yet-consumed conditions for the guesser's NEXT guess --
      // shown once at the end of the live round's entries so there's
      // always a current answer to "what am I aiming for right now"
      // without needing the removed on-screen badge.
      if (isLiveFieldReport && !quest.used) {
        pushConditionsLine(quest.conditions);
      }

      // Recon Sweep result, shown the instant it's used rather than
      // waiting for the setter's Keep/New decision to finalize this
      // round's guess entry (see letterProbeServer.js's postScore --
      // that's what actually attaches entry.letterProbeResult above, and
      // it doesn't run until the setter reacts, a full extra round-trip
      // after the guesser already has the answer). state.powers.
      // letterProbeResult is live from the moment the power fires until
      // postScore consumes it into that permanent entry, so reading it
      // straight from state here — same "live buffer" idea as the Field
      // Report conditions/quest status above — surfaces the exact same
      // text immediately, then hands off to the permanent line with no
      // gap or duplicate (the two are mutually exclusive: postScore
      // clears this field in the same step it fills in the entry).
      if (isLiveRound && viewerRole === "guesser" && state.powers?.letterProbeResult) {
        const { count, distinctTested, letters } = state.powers.letterProbeResult;
        const meta = window.POWER_METADATA?.letterProbe;
        entries.push({
          type: "power",
          cssClass: " log-power-guesser",
          text: `${meta?.label || "Letter Scan"}: ${count}/${distinctTested} (${letters})`
        });
      }

      // Quest completion/one-away, same "current status once at the end
      // of the live round" treatment as the Field Report conditions above
      // -- there's no per-guess record of exactly when ready/oneAway
      // flipped, only the current state, so this can't be attached to a
      // specific guess row. Always the guesser's own color: it's their
      // quest regardless of which role is viewing the log.
      if (isLiveRound && quest?.type) {
        const status = window.computeQuestStatus?.(state);
        if (status?.done) {
          entries.push({
            type: "power",
            cssClass: " log-power-guesser",
            text: `Quest: ${status.meta.label} — ${status.desc}`
          });
        } else if (quest.oneAway) {
          entries.push({
            type: "power",
            cssClass: " log-power-guesser",
            text: `Quest: ${status.meta.label} — One guess away!`
          });
        }
      }

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
    // Rendered unconditionally (not gated on its own .hidden class), even
    // while its Log/Info tab isn't the one showing (setter-sidebar.js /
    // guesser-sidebar.js), so it's already current the instant a player
    // switches to it instead of showing stale content from before.
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

  window.renderActionLog = renderActionLog;
})();
