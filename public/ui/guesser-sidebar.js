(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  /*
    Just the action log now -- no Info tab, nothing to switch between (see
    index.html). renderActionLog already runs on every state update
    (client.js), so this only has to catch the player returning to the
    guesser screen from somewhere else, in case a state update hasn't
    landed since then and the log would otherwise sit stale until one does.
  */
  function initialiseGuesserSidebar() {
    const guesserScreen = byId("guesserScreen");
    if (!guesserScreen) return;

    let wasActive = guesserScreen.classList.contains("active");

    const screenObserver = new MutationObserver(() => {
      const isActive = guesserScreen.classList.contains("active");

      if (isActive && !wasActive) {
        window.renderActionLog?.(window.state, "guesser");
      }

      wasActive = isActive;
    });

    screenObserver.observe(guesserScreen, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

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
