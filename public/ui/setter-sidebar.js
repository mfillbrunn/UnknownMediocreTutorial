(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function setTabState(button, selected) {
    if (!button) return;

    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }

  /*
    panelName is "log", "notes", or null -- null means neither panel is
    open (the default/collapsed state; see initialiseSetterSidebar's
    click handlers for the toggle-the-active-one-closed behavior).
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
  }

  function initialiseSetterSidebar() {
    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    // Tracks which of Log/Notes is currently open (null = neither) so a
    // click on the already-open tab can close it instead of re-opening
    // the same panel.
    let activeSetterPanel = null;

    logButton?.addEventListener("click", () => {
      activeSetterPanel = activeSetterPanel === "log" ? null : "log";
      showSetterSidebarPanel(activeSetterPanel);
    });

    notesButton?.addEventListener("click", () => {
      activeSetterPanel = activeSetterPanel === "notes" ? null : "notes";
      showSetterSidebarPanel(activeSetterPanel);
    });

    // Required initial state: Log/Notes collapsed.
    showSetterSidebarPanel(null);

    // Whenever the player returns to the setter screen, collapse Log/Notes
    // back down.
    const setterScreen = byId("setterScreen");

    if (setterScreen) {
      let wasActive = setterScreen.classList.contains("active");

      const screenObserver = new MutationObserver(() => {
        const isActive = setterScreen.classList.contains("active");

        if (isActive && !wasActive) {
          activeSetterPanel = null;
          showSetterSidebarPanel(null);
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
