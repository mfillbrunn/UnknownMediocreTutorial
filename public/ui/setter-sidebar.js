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

  /*
    guesserPowerContainer is never actually populated with the quest card
    on the setter's own client -- client.js's updateUI() only ever calls
    quest.js's updateQuestBadge(state, myRole), so on the setter's screen
    that only ever fills setterPowerContainer (the setter's own, hidden by
    features.css), never the guesser's. Built directly from state instead
    of cloned, with the click handler simply never attached (rather than
    stripped afterward like makeReadOnlyClone does for the power buttons)
    -- quest.js's own onclick fires USE_QUEST as window.currentUser?.id,
    which would be the SETTER's id if this card were ever built by the
    normal guesser-role path and merely left visible.
  */
  function buildReadOnlyQuestCard(state) {
    if (
      typeof window.computeQuestStatus !== "function" ||
      typeof window.createQuestBadgeTile !== "function" ||
      typeof window.questCardProgressText !== "function"
    ) {
      return null;
    }

    const q = state?.powers?.quest;
    if (!q || !q.type) return null;

    const status = window.computeQuestStatus(state);
    if (!status) return null;

    const { wrapper, btn, labelEl, chip } = window.createQuestBadgeTile(q.type);

    btn.title = status.meta.label;
    labelEl.textContent = status.meta.label;
    window.fitBadgeLabel?.(labelEl);
    chip.textContent = window.questCardProgressText(status, q);
    chip.style.display = "";

    btn.classList.add("quest-badge-readonly", "opponent-power-readonly");
    btn.classList.toggle("quest-ready", !status.done && !!q.ready);
    btn.classList.toggle("quest-oneaway", !status.done && !q.ready && !!q.oneAway);
    btn.classList.toggle("quest-done", !!status.done);
    btn.classList.toggle("power-used", !!status.done);
    btn.disabled = true;
    btn.tabIndex = -1;
    btn.setAttribute("aria-disabled", "true");

    return wrapper;
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

    /*
      The quest is genuinely the Inspector's, so it belongs in the Opp
      view -- pinned first, same position quest.js gives it in the
      guesser's own real power row (see features.css, which only hides
      quest cards from the setter's own "You" container, not this one).
    */
    const questCard = buildReadOnlyQuestCard(window.state);
    if (questCard) {
      fragment.appendChild(questCard);
      visiblePowerCount += 1;
    }

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
