(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function setTabState(button, selected) {
    if (!button) return;

    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }

  /*
    Opponent powers are clones of the rendered setter powers.
    Cloning deliberately does not copy addEventListener handlers, and
    all remaining inline interaction is removed below -- same approach
    setter-sidebar.js uses for its own Opp view.
  */
  function makeReadOnlyClone(sourceNode) {
    const clone = sourceNode.cloneNode(true);
    const elements = [clone, ...clone.querySelectorAll("*")];

    for (const element of elements) {
      element.removeAttribute("id");
      element.removeAttribute("onclick");
      element.removeAttribute("onpointerdown");
      element.removeAttribute("ontouchstart");

      if (
        element.matches(
          "button, input, select, textarea, a, [role='button']"
        )
      ) {
        element.tabIndex = -1;
        element.setAttribute("aria-disabled", "true");
      }
    }

    clone.classList.add("opponent-power-readonly");
    return clone;
  }

  function syncGuesserOpponentPowers() {
    /*
      setterPowerContainer is populated with every setter-power button on
      every client (PowerEngine.renderButtons() runs unconditionally for
      all registered powers, setter and guesser alike) -- only the
      #setterScreen it lives on stays hidden on a guesser's own client.
      The setter has no quest of their own, so unlike the setter's Opp
      view (which pins the Inspector's quest in first), there's nothing
      extra to build here -- straight clone of whatever's already there.
    */
    const source = byId("setterPowerContainer");
    const target = byId("guesserOpponentPowerContainer");

    if (!source || !target) return;

    const fragment = document.createDocumentFragment();
    let visiblePowerCount = 0;

    for (const child of source.children) {
      fragment.appendChild(makeReadOnlyClone(child));
      visiblePowerCount += 1;
    }

    target.replaceChildren(fragment);

    if (visiblePowerCount === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "setter-sidebar-empty";
      emptyMessage.textContent = "Opponent powers are not available yet.";
      target.appendChild(emptyMessage);
    }
  }

  function showGuesserPowerView(viewName) {
    const ownContainer = byId("guesserPowerContainer");
    const opponentContainer = byId("guesserOpponentPowerContainer");

    const ownButton = byId("guesserPowersYouBtn");
    const opponentButton = byId("guesserPowersOppBtn");

    const showOpponent = viewName === "opp";

    if (showOpponent) {
      syncGuesserOpponentPowers();
    }

    ownContainer?.classList.toggle("hidden", showOpponent);
    opponentContainer?.classList.toggle("hidden", !showOpponent);

    setTabState(ownButton, !showOpponent);
    setTabState(opponentButton, showOpponent);
  }

  function initialiseGuesserSidebar() {
    const ownButton = byId("guesserPowersYouBtn");
    const opponentButton = byId("guesserPowersOppBtn");

    ownButton?.addEventListener("click", () => {
      showGuesserPowerView("you");
    });

    opponentButton?.addEventListener("click", () => {
      showGuesserPowerView("opp");
    });

    showGuesserPowerView("you");

    /*
      Keep the read-only opponent view synchronized whenever the setter's
      own power container is rebuilt or updated (same MutationObserver
      pattern as setter-sidebar.js's syncSetterOpponentPowers).
    */
    const setterPowerContainer = byId("setterPowerContainer");

    if (setterPowerContainer) {
      let syncQueued = false;

      const queueSync = () => {
        if (syncQueued) return;
        syncQueued = true;

        requestAnimationFrame(() => {
          syncQueued = false;
          syncGuesserOpponentPowers();
        });
      };

      const powerObserver = new MutationObserver(queueSync);

      powerObserver.observe(setterPowerContainer, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });

      queueSync();
    }

    /*
      Whenever the player returns to the guesser screen, reset the
      power view back to You.
    */
    const guesserScreen = byId("guesserScreen");

    if (guesserScreen) {
      let wasActive = guesserScreen.classList.contains("active");

      const screenObserver = new MutationObserver(() => {
        const isActive = guesserScreen.classList.contains("active");

        if (isActive && !wasActive) {
          showGuesserPowerView("you");
        }

        wasActive = isActive;
      });

      screenObserver.observe(guesserScreen, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }
  }

  window.showGuesserPowerView = showGuesserPowerView;
  window.syncGuesserOpponentPowers = syncGuesserOpponentPowers;

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
