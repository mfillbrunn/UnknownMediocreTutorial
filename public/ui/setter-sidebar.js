(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function setTabState(button, selected) {
    if (!button) return;

    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }

  /*
    panelName is "log" or "info" -- Log starts open by default (see
    initialiseSetterSidebar), and clicking the currently-open tab closes
    it, dropping panelName to null (neither panel open) rather than
    forcing something to always be shown.
  */
  function showSetterSidebarPanel(panelName) {
    const activitySection = document.querySelector(
      "#setterScreen .setter-sidebar-activity"
    );
    const logPanel = byId("actionLogSetter");
    const infoPanel = byId("infoPanelSetter");

    const logButton = byId("actionLogBtnSetter");
    const infoButton = byId("infoBtnSetter");

    const showLog = panelName === "log";
    const showInfo = panelName === "info";

    logPanel?.classList.toggle("hidden", !showLog);
    infoPanel?.classList.toggle("hidden", !showInfo);

    setTabState(logButton, showLog);
    setTabState(infoButton, showInfo);

    activitySection?.classList.toggle("panel-open", showLog || showInfo);
  }

  function initialiseSetterSidebar() {
    const logButton = byId("actionLogBtnSetter");
    const infoButton = byId("infoBtnSetter");

    // Tracks which of Log/Info is currently open (null = neither) so a
    // click on the already-open tab can close it instead of re-opening
    // the same panel.
    let activeSetterPanel = "log";

    logButton?.addEventListener("click", () => {
      activeSetterPanel = activeSetterPanel === "log" ? null : "log";
      showSetterSidebarPanel(activeSetterPanel);
    });

    infoButton?.addEventListener("click", () => {
      activeSetterPanel = activeSetterPanel === "info" ? null : "info";
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
