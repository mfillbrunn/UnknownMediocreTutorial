// client/bug-report.js — the "Report a bug" dialog.
//
// Posts to /api/bug-report, which writes the row with the server's
// service-role Supabase client (see server/routes/bugReports.js). Going
// through the server rather than inserting from here means guests — who
// have no Supabase session — can report bugs too, and the table needs no
// public insert policy.
//
// The report carries a little context the reporter would otherwise have to
// describe by hand (which screen they were on, whether they were in a room,
// the phase of that game). Deliberately nothing about the secret word or
// anyone's guesses: a bug report is not worth leaking a live game over.

(function () {
  const MAX_MESSAGE = 4000;

  function byIdSafe(id) {
    return document.getElementById(id);
  }

  function currentScreenName() {
    return document.querySelector(".screen.active")?.id || null;
  }

  // Small, non-sensitive snapshot. Anything that could reveal the secret
  // (the word itself, the remaining-words list, the AI's script) is left
  // out on purpose.
  function collectAppState() {
    const state = window.state;
    if (!state) return { inGame: false };
    return {
      inGame: true,
      phase: state.phase || null,
      round: state.round ?? null,
      isDaily: !!state.isDaily,
      isTutorial: !!state.isTutorial,
      ranked: !!state.ranked,
      timed: state.timeControl?.enabled !== false,
      guessCount: state.guessCount ?? null
    };
  }

  function setStatus(text, isError) {
    const el = byIdSafe("bugReportStatus");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  function openBugReport() {
    const modal = byIdSafe("bugReportModal");
    if (!modal) return;
    setStatus("");
    const field = byIdSafe("bugReportMessage");
    if (field) field.value = "";
    modal.classList.remove("hidden");
    // Focus after the class change so the browser scrolls the now-visible
    // field into view rather than a hidden one.
    requestAnimationFrame(() => field?.focus());
  }

  function closeBugReport() {
    byIdSafe("bugReportModal")?.classList.add("hidden");
  }

  async function submitBugReport() {
    const field = byIdSafe("bugReportMessage");
    const contactField = byIdSafe("bugReportContact");
    const submitBtn = byIdSafe("bugReportSubmitBtn");

    const message = (field?.value || "").trim();
    if (!message) {
      setStatus("Please describe what went wrong.", true);
      field?.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    setStatus("Sending…");

    try {
      const response = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.slice(0, MAX_MESSAGE),
          contact: (contactField?.value || "").trim() || null,
          reporterId: window.currentUser?.id || null,
          reporterName: window.myProfile?.username || window.currentUser?.email || null,
          isGuest: !!window.isGuestPlayer?.(),
          roomId: window.roomId || null,
          page: currentScreenName(),
          appState: collectAppState()
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setStatus(payload?.error || "Could not send that report. Please try again.", true);
        return;
      }

      setStatus("Thanks — report sent.");
      if (field) field.value = "";
      setTimeout(closeBugReport, 900);
    } catch {
      setStatus("Could not reach the server. Please try again.", true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  byIdSafe("bugReportBtn")?.addEventListener("click", openBugReport);
  byIdSafe("bugReportCancelBtn")?.addEventListener("click", closeBugReport);
  byIdSafe("bugReportSubmitBtn")?.addEventListener("click", submitBugReport);

  // Clicking the backdrop (but not the card itself) closes the dialog, the
  // same way the other overlays in this app behave.
  byIdSafe("bugReportModal")?.addEventListener("click", event => {
    if (event.target?.id === "bugReportModal") closeBugReport();
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (byIdSafe("bugReportModal")?.classList.contains("hidden") !== false) return;
    closeBugReport();
  });

  window.openBugReport = openBugReport;
})();
