// client/action-log.js — vanilla JS port of ActionLog.jsx

(function () {
  // A power event is colored by which role it belongs to (the role that
  // used it), not by the current viewer's own screen — otherwise an
  // opponent's power looks identical to your own in the log.
  function powerEntry(evt, viewerRole) {
    const formatted = window.formatPowerEvent?.(evt);
    if (!formatted) return null;
    const isMine = formatted.actorRole === viewerRole;
    const who =
      formatted.actorRole == null ? "" : isMine ? "You used " : "Opp used ";
    const roleClass = formatted.actorRole ? ` log-power-${formatted.actorRole}` : "";
    const detailText = isMine ? formatted.ownText : formatted.opponentText;
    // "X used <Power Name>" by default -- the full result (ownText/
    // opponentText, which already reads "<label>: <what happened>") only
    // shows once the power name is tapped, via the delegated click
    // handler installed in renderActionLog below. Skipped entirely when
    // there's nothing beyond the bare label to expand into.
    const hasDetail = !!detailText && detailText !== formatted.label;
    const text = hasDetail
      ? `${who}<span class="log-power-name" role="button" tabindex="0">${formatted.label}</span>` +
        `<div class="log-power-detail hidden">${detailText}</div>`
      : `${who}${formatted.label}`;
    return {
      type: "power",
      cssClass: roleClass,
      text,
      // Identifies this specific use so the same event arriving from both
      // the live buffer and history isn't logged twice (see buildLog).
      dedupeKey: `${formatted.actorRole || ""}|${evt?.id || ""}|${JSON.stringify(evt?.emissions || [])}`
    };
  }

  function buildLog(state, myRole) {
    if (!state) return [];
    const entries = [];
    const myId = typeof myUserId === "function" ? myUserId() : null;

    entries.push({ type: "round", text: "Game Log" });

    // Completed rounds are archived (and state.history is wiped) at each
    // round boundary, so pull them from state.matchRounds too — otherwise
    // the log only ever shows the round currently in progress.
    const rounds = Array.isArray(state.matchRounds) ? state.matchRounds : [];

    // Power Choice rewards: which card each player took and what it did.
    // BOTH roles' picks are recorded server-side and neither is redacted,
    // so each player's log shows their own and their opponent's — a
    // power-backed reward's own power event says nothing about the reward
    // card that granted it. The live round reads powerChoice.resolutionLog;
    // completed rounds read the copy archived onto the round record
    // (gameOver.js), since powerChoice itself is replaced wholesale at each
    // round boundary and used to take every earlier reward with it.
    // Bucketed by the guess number that was on the board when the card was
    // taken, so each lands in its real place in the run of play.
    let rewardsByGuess = new Map();

    function loadRewards(list) {
      rewardsByGuess = new Map();
      (Array.isArray(list) ? list : []).forEach(entry => {
        const at = Math.max(0, Number(entry?.guessNumber) || 0);
        if (!rewardsByGuess.has(at)) rewardsByGuess.set(at, []);
        rewardsByGuess.get(at).push(entry);
      });
    }

    function pushRewards(guessNumber, viewerRole) {
      (rewardsByGuess.get(guessNumber) || []).forEach(entry => {
        const mine = entry?.role === viewerRole;
        const who = mine ? "You took " : "Opp took ";
        const detail = entry?.detailText;
        const label = entry?.title || "a reward";
        entries.push({
          type: "power",
          cssClass: entry?.role ? ` log-power-${entry.role}` : "",
          text: detail
            ? `${who}<span class="log-power-name" role="button" tabindex="0">${label}</span>` +
              `<div class="log-power-detail hidden">${detail}</div>`
            : `${who}${label}`
        });
      });
      rewardsByGuess.delete(guessNumber);
    }

    // Whatever is left in the current round's bucket map: taken after the
    // last guess resolved, or keyed to a guess this viewer can't see (the
    // guesser's history is filtered by safeState for masking powers, so a
    // server-side guess number need not line up with a rendered row).
    function flushRemainingRewards(viewerRole) {
      [...rewardsByGuess.keys()]
        .sort((a, b) => a - b)
        .forEach(key => pushRewards(key, viewerRole));
    }

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
          // The conditions are the actionable part of the line (what to
          // actually aim the next guess at) -- bolded so they stand out
          // from the surrounding log chatter at a glance.
          entries.push({
            type: "power",
            cssClass: "",
            text: `Quest: Field Report — <strong>${conditionList}</strong>`
          });
        }
      }
      // Roles can swap between rounds, so "you"/"the setter" has to be
      // resolved per-round rather than from the viewer's current role.
      const isSetterThisRound = myId != null && setterIdThisRound === myId;
      const viewerRole = isSetterThisRound ? "setter" : "guesser";
      let guessNumber = 0;

      // A reward taken before this round's first guess landed.
      pushRewards(0, viewerRole);

      (history || []).forEach(entry => {
        if (!entry?.guess) return;
        // Logged BEFORE the guess it applied to -- the conditions that
        // were live are what the player was actually aiming for when
        // they made this guess.
        if (isLiveFieldReport) {
          pushConditionsLine(quest.conditionsHistory?.[guessNumber]);
        }
        guessNumber++;
        // Sneaky Guess's own masking already comes through on entry.guess
        // itself -- safeState.js permanently redacts the ONE entry it was
        // used on for the setter's view (e.stealthApplied), so there's
        // nothing left for this log to re-derive here. (A previous version
        // of this line recomputed it client-side off the live, moment-to-
        // moment state.powers.stealthGuessActive flag and the wrong role,
        // which blanked every guess in the round -- not just the one
        // actually protected -- for whichever guess happened to be
        // pending at render time.)
        //
        // Total Blackout hides the guesser's entire history board (see
        // history.js's buildHistoryRenderState returning [] while
        // blindGuessActive) -- the log lists the same round's guessed
        // words in plain text, so without this it's an easy way to read
        // right through the blackout. Redact every guess in the live
        // round the same way, for as long as the board itself is blanked.
        const blackedOut = isLiveRound && state.powers?.blindGuessActive;
        const guessDisplay = blackedOut
          ? `<span class="log-blackout-word">${"█".repeat(entry.guess.length)}</span>`
          : entry.guess.toUpperCase();
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

        // Any reward card taken while this many guesses were on the board.
        pushRewards(guessNumber, viewerRole);
      });

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

      // The not-yet-consumed conditions for the guesser's NEXT guess --
      // shown once at the very end of the live round's entries, below the
      // quest status line above, so the last thing the log says is what to
      // aim the next guess at.
      if (isLiveFieldReport && !quest.used) {
        pushConditionsLine(quest.conditions);
      }

      flushRemainingRewards(viewerRole);
      return viewerRole;
    }

    rounds.forEach((round, idx) => {
      loadRewards(round.rewards);
      appendRound(round.history, round.setter, idx, false);
    });

    loadRewards(state.powerChoice?.resolutionLog);

    // endGame() archives the just-finished round into state.matchRounds
    // (the loop above) but doesn't clear state.history until the player
    // actually advances past the summary screen -- for that whole window
    // the round that just ended is sitting in both places. Appending
    // state.history here too, unconditionally, duplicated every line of
    // the round the player just finished for as long as the summary
    // screen was up.
    const liveViewerRole =
      state.phase === "gameOver"
        ? (myId != null && state.setter === myId ? "setter" : "guesser")
        : appendRound(state.history, state.setter, rounds.length, true);

    // gameOver skips appendRound for the live round entirely, so its
    // rewards have had no chance to flush yet.
    flushRemainingRewards(liveViewerRole);

    // Powers used mid-turn are only attached to a history entry once that
    // guess/decision resolves. Surface them the moment they're used instead
    // of making the player wait for the turn to finish — once the entry
    // finalizes, this live buffer is cleared and the authoritative version
    // (with any result learned since) takes its place.
    // A live event is the same use as its history copy once the enclosing
    // turn resolves. client.js clears this buffer when history grows, but
    // a reward-granted power is applied outside the normal guess cycle, so
    // that clear can land a beat late and briefly show the use twice.
    // Keying on the event's own content makes the de-dupe order-independent
    // rather than dependent on when the buffer happens to be cleared.
    const seen = new Set(entries.map(entry => entry.dedupeKey).filter(Boolean));
    const live = Array.isArray(window._livePowerEvents) ? window._livePowerEvents : [];
    live.forEach(evt => {
      const pe = powerEntry(evt, liveViewerRole);
      if (!pe) return;
      if (pe.dedupeKey && seen.has(pe.dedupeKey)) return;
      if (pe.dedupeKey) seen.add(pe.dedupeKey);
      entries.push(pe);
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

    // Toggles a power entry's collapsed "You used <Power Name>" line open
    // to show its full result (see powerEntry's .log-power-detail above) --
    // delegated once per container rather than re-bound on every rebuild,
    // since innerHTML below replaces the actual elements each time.
    if (!container.dataset.expandBound) {
      container.dataset.expandBound = "1";
      container.addEventListener("click", event => {
        const nameEl = event.target.closest(".log-power-name");
        if (!nameEl) return;
        nameEl.nextElementSibling?.classList.toggle("hidden");
      });
      container.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const nameEl = event.target.closest(".log-power-name");
        if (!nameEl) return;
        event.preventDefault();
        nameEl.nextElementSibling?.classList.toggle("hidden");
      });
    }

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
    // block: "end" (not the default "start") -- "start" aligns the
    // anchor's (zero-height) top edge with the container's top edge,
    // which scrolls straight past the last real entry instead of settling
    // on it, leaving empty container background visible where the last
    // line should be. "end" aligns its bottom edge with the container's
    // bottom edge instead, landing exactly at the true bottom.
    if (grew) {
      container.querySelector(".log-scroll-anchor")?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }

  window.renderActionLog = renderActionLog;
})();
