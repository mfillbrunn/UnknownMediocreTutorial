(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function setTabState(button, selected) {
    if (!button) return;

    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }

  /*
    Unlike the setter's equivalent (ui/setter-sidebar.js), this box
    doesn't collapse to just its tabs -- it shares a short, fixed-height
    row with the power cards (features.css's .guesser-powers-row), not a
    tall standalone sidebar column, so there's no spare vertical space to
    reclaim by closing both panels. Exactly one of Log/Info is always
    showing; clicking a tab just switches which one.
  */
  function showGuesserSidebarPanel(panelName) {
    const logPanel = byId("actionLogGuesser");
    const infoPanel = byId("infoPanelGuesser");

    const logButton = byId("actionLogBtnGuesser");
    const infoButton = byId("infoBtnGuesser");

    const showLog = panelName === "log";
    const showInfo = panelName === "info";

    logPanel?.classList.toggle("hidden", !showLog);
    infoPanel?.classList.toggle("hidden", !showInfo);

    setTabState(logButton, showLog);
    setTabState(infoButton, showInfo);

    // The log panel is otherwise only rendered on state updates -- make
    // sure it's current the instant it's switched to, not stale from
    // whenever it was last visible.
    if (showLog) window.renderActionLog?.(window.state, "guesser");
  }

  function initialiseGuesserSidebar() {
    const logButton = byId("actionLogBtnGuesser");
    const infoButton = byId("infoBtnGuesser");

    logButton?.addEventListener("click", () => showGuesserSidebarPanel("log"));
    infoButton?.addEventListener("click", () => showGuesserSidebarPanel("info"));

    // Required initial state: Log open.
    showGuesserSidebarPanel("log");

    // Whenever the player returns to the guesser screen, reopen Log by
    // default again.
    const guesserScreen = byId("guesserScreen");

    if (guesserScreen) {
      let wasActive = guesserScreen.classList.contains("active");

      const screenObserver = new MutationObserver(() => {
        const isActive = guesserScreen.classList.contains("active");

        if (isActive && !wasActive) {
          showGuesserSidebarPanel("log");
        }

        wasActive = isActive;
      });

      screenObserver.observe(guesserScreen, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }
  }

  window.showGuesserSidebarPanel = showGuesserSidebarPanel;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialiseGuesserSidebar,
      { once: true }
    );
  } else {
    initialiseGuesserSidebar();
  }
})();
