(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function setTabState(button, selected) {
    if (!button) return;

    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }

  function showSetterSidebarPanel(panelName) {
    const logPanel = byId("actionLogSetter");
    const notesPanel = byId("notesPanelSetter");

    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    const showLog = panelName === "log";

    logPanel?.classList.toggle("hidden", !showLog);
    notesPanel?.classList.toggle("hidden", showLog);

    setTabState(logButton, showLog);
    setTabState(notesButton, !showLog);
  }

  /*
    Detect a generated Quest element without depending on one exact
    class name. client/quest.js was not included in the supplied files.
  */
  function elementLooksLikeQuest(root) {
    if (!(root instanceof Element)) return false;

    const elements = [root, ...root.querySelectorAll("*")];

    return elements.some(element => {
      const marker = [
        element.id,
        element.getAttribute("class"),
        element.getAttribute("data-quest"),
        element.getAttribute("data-quest-id"),
        element.getAttribute("data-power-id"),
        element.getAttribute("data-type")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return marker.includes("quest");
    });
  }

  /*
    Opponent powers are clones of the rendered guesser powers.
    Cloning deliberately does not copy addEventListener handlers, and
    all remaining inline interaction is removed below.
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

  function syncSetterOpponentPowers() {
    /*
      This assumes the game currently renders the Inspector's powers
      into #guesserPowerContainer even while the setter screen is active.
    */
    const source = byId("guesserPowerContainer");
    const target = byId("setterOpponentPowerContainer");

    if (!source || !target) return;

    const fragment = document.createDocumentFragment();
    let visiblePowerCount = 0;

    for (const child of source.children) {
      /*
        The setter should not see a Quest card in either You or Opp view.
      */
      if (elementLooksLikeQuest(child)) continue;

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

  function showSetterPowerView(viewName) {
    const ownContainer = byId("setterPowerContainer");
    const opponentContainer = byId("setterOpponentPowerContainer");

    const ownButton = byId("setterPowersYouBtn");
    const opponentButton = byId("setterPowersOppBtn");

    const showOpponent = viewName === "opp";

    if (showOpponent) {
      syncSetterOpponentPowers();
    }

    ownContainer?.classList.toggle("hidden", showOpponent);
    opponentContainer?.classList.toggle("hidden", !showOpponent);

    setTabState(ownButton, !showOpponent);
    setTabState(opponentButton, showOpponent);
  }

  function initialiseSetterSidebar() {
    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    const ownButton = byId("setterPowersYouBtn");
    const opponentButton = byId("setterPowersOppBtn");

    logButton?.addEventListener("click", () => {
      showSetterSidebarPanel("log");
    });

    notesButton?.addEventListener("click", () => {
      showSetterSidebarPanel("notes");
    });

    ownButton?.addEventListener("click", () => {
      showSetterPowerView("you");
    });

    opponentButton?.addEventListener("click", () => {
      showSetterPowerView("opp");
    });

    /*
      Required initial state:
      Log visible and your own powers visible.
    */
    showSetterSidebarPanel("log");
    showSetterPowerView("you");

    /*
      Keep the read-only opponent view synchronized whenever the
      ordinary guesser power container is rebuilt or updated.
    */
    const guesserPowerContainer = byId("guesserPowerContainer");

    if (guesserPowerContainer) {
      let syncQueued = false;

      const queueSync = () => {
        if (syncQueued) return;
        syncQueued = true;

        requestAnimationFrame(() => {
          syncQueued = false;
          syncSetterOpponentPowers();
        });
      };

      const powerObserver = new MutationObserver(queueSync);

      powerObserver.observe(guesserPowerContainer, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });

      queueSync();
    }

    /*
      Whenever the player returns to the setter screen, reset the
      sidebar to Log + You.
    */
    const setterScreen = byId("setterScreen");

    if (setterScreen) {
      let wasActive = setterScreen.classList.contains("active");

      const screenObserver = new MutationObserver(() => {
        const isActive = setterScreen.classList.contains("active");

        if (isActive && !wasActive) {
          showSetterSidebarPanel("log");
          showSetterPowerView("you");
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
  window.showSetterPowerView = showSetterPowerView;
  window.syncSetterOpponentPowers = syncSetterOpponentPowers;

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
