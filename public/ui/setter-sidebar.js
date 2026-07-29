(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function setTabState(button, selected) {
    if (!button) return;

    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }

  /*
    panelName is "log" or "notes" -- Log starts open by default (see
    initialiseSetterSidebar), and clicking the currently-open tab closes
    it, dropping panelName to null (neither panel open) rather than
    forcing something to always be shown.
  */
  function showSetterSidebarPanel(panelName) {
    const activitySection = document.querySelector(
      "#setterScreen .setter-sidebar-activity"
    );
    const logPanel = byId("actionLogSetter");
    const notesPanel = byId("notesPanelSetter");

    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    const showLog = panelName === "log";
    const showNotes = panelName === "notes";

    logPanel?.classList.toggle("hidden", !showLog);
    notesPanel?.classList.toggle("hidden", !showNotes);

    setTabState(logButton, showLog);
    setTabState(notesButton, showNotes);

    activitySection?.classList.toggle("panel-open", showLog || showNotes);

    // Notes tracks its own active/inactive state separately (keyboard
    // capture, in-progress draft, entry list -- see client/notes.js), on
    // top of this tab's own hidden/visible class above. Only one of these
    // two calls actually does anything: toggleNotes no-ops via its own
    // guard when already active, closeNotes no-ops when already inactive.
    // Without this, switching to Log wouldn't release Notes' keyboard
    // capture, so real typing would keep getting swallowed by the (now
    // hidden) notes scratchpad instead of reaching the real guess/secret.
    if (showNotes) {
      if (!window.isNotesActive?.()) window.toggleNotes?.("setter");
    } else {
      window.closeNotes?.();
    }
  }

  function initialiseSetterSidebar() {
    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    // Tracks which of Log/Notes is currently open (null = neither) so a
    // click on the already-open tab can close it instead of re-opening
    // the same panel.
    let activeSetterPanel = "log";

    logButton?.addEventListener("click", () => {
      activeSetterPanel = activeSetterPanel === "log" ? null : "log";
      showSetterSidebarPanel(activeSetterPanel);
    });

    notesButton?.addEventListener("click", () => {
      activeSetterPanel = activeSetterPanel === "notes" ? null : "notes";
      showSetterSidebarPanel(activeSetterPanel);
    });

    // Required initial state: Log open.
    showSetterSidebarPanel("log");

    // Whenever the player returns to the setter screen, reopen Log by
    // default again.
    const setterScreen = byId("setterScreen");

    if (setterScreen) {
      let wasActive = setterScreen.classList.contains("active");

      const screenObserver = new MutationObserver(() => {
        const isActive = setterScreen.classList.contains("active");

        if (isActive && !wasActive) {
          activeSetterPanel = "log";
          showSetterSidebarPanel("log");
        }

        wasActive = isActive;
      });

      screenObserver.observe(setterScreen, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }
  }

  /*
    Exposed in case the tutorial or another UI module needs to select
    one of these views.
  */
  window.showSetterSidebarPanel = showSetterSidebarPanel;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialiseSetterSidebar,
      { once: true }
    );
  } else {
    initialiseSetterSidebar();
  }
})();
