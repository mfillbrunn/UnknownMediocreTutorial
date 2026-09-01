// public/cuddle/site-integration.js
// Groups existing modes without replacing their buttons or handlers. It also
// redirects each grouped mode's top-level Back control to its new parent hub.
(function () {
  "use strict";

  const GROUPS = Object.freeze([
    {
      key: "multiplayer",
      label: "Multiplayer",
      triggerId: "cuddleMultiplayerMenuBtn",
      screenId: "cuddleMultiplayerMenuScreen",
      panelId: "cuddleMultiplayerMenuItems",
      itemIds: ["playFriendMainBtn", "playRoomTools", "rankedMenuBtn", "myGamesBtn"],
      childRoutes: [
        ["playFriendScreen", ".screen-back-btn"],
        ["rankedPlayScreen", ".screen-back-btn"],
        ["rankedScreen", ".screen-back-btn"],
        ["rankedMenuScreen", ".screen-back-btn"],
        ["myGamesScreen", ".screen-back-btn"]
      ],
      notificationSourceId: "myGamesNotifyBadge"
    },
    {
      key: "single-player",
      label: "Single Player",
      triggerId: "cuddleSinglePlayerMenuBtn",
      screenId: "cuddleSinglePlayerMenuScreen",
      panelId: "cuddleSinglePlayerMenuItems",
      itemIds: ["singlePlayerBtn", "cuddleBtn"],
      childRoutes: [
        ["singlePlayerScreen", "#spBackBtn"],
        ["cuddleScreen", "[data-action=\"back\"]"]
      ]
    }
  ]);

  const routes = new Map();
  const records = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function showScreenId(id) {
    document.body?.classList.add("menu-mode");
    if (typeof window.showScreen === "function") {
      window.showScreen(id);
      return;
    }
    document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
    byId(id)?.classList.add("active");
  }

  function showStartup() {
    if (typeof window.showStartup === "function") window.showStartup();
    else showScreenId("startupScreen");
  }

  function getStartupMenu() {
    const startup = byId("startupScreen");
    if (!startup) return null;
    return startup.querySelector(".menu-center .menu-buttons")
      || startup.querySelector(".menu-buttons");
  }

  function directMenuChild(menu, node) {
    let current = node;
    while (current && current.parentElement !== menu) current = current.parentElement;
    return current?.parentElement === menu ? current : null;
  }

  function makeTrigger(menu, config, anchor) {
    let trigger = byId(config.triggerId);
    if (trigger) return trigger;

    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = config.triggerId;
    trigger.className = "menu-btn cuddle-menu-hub-trigger";
    trigger.setAttribute("aria-controls", config.screenId);
    trigger.innerHTML = `<span>${config.label}</span>${config.notificationSourceId
      ? `<span id="cuddleMultiplayerNotifyBadge" class="notify-badge cuddle-menu-notify hidden" title="A game needs attention" aria-hidden="true">!</span>`
      : ""}`;
    menu.insertBefore(trigger, anchor || null);
    return trigger;
  }

  function makeHubScreen(config) {
    let screen = byId(config.screenId);
    if (screen) return screen;

    screen = document.createElement("section");
    screen.id = config.screenId;
    screen.className = "screen game-menu streamlined-menu-screen cuddle-mode-hub";
    screen.innerHTML = `
      <div class="menu-center streamlined-menu-card cuddle-mode-hub-shell">
        <div class="screen-back-header cuddle-mode-hub-header">
          <button type="button" class="menu-btn screen-back-btn cuddle-mode-hub-back">\u2190 Back</button>
          <h2 class="menu-title cuddle-mode-hub-title">${config.label}</h2>
          <span class="cuddle-mode-hub-header-spacer" aria-hidden="true"></span>
        </div>
        <div id="${config.panelId}" class="menu-buttons streamlined-menu-buttons play-menu-buttons cuddle-mode-hub-items"></div>
      </div>`;

    const appMain = byId("appMain") || byId("startupScreen")?.parentElement || document.body;
    appMain.appendChild(screen);
    screen.querySelector(".cuddle-mode-hub-back")?.addEventListener("click", showStartup);
    return screen;
  }

  function createGroup(menu, config) {
    const items = config.itemIds.map(byId).filter(Boolean);
    if (!items.length) return null;

    const movableItems = items.map(item => directMenuChild(menu, item) || item);
    const anchor = movableItems.find(item => item.parentElement === menu) || null;
    const trigger = makeTrigger(menu, config, anchor);
    const screen = makeHubScreen(config);
    const panel = byId(config.panelId);
    if (!panel) return null;

    movableItems.forEach(item => panel.appendChild(item));
    trigger.addEventListener("click", () => showScreenId(config.screenId));
    config.childRoutes.forEach(([childId, backSelector]) => {
      routes.set(childId, { parentId: config.screenId, backSelector });
    });

    const record = { ...config, trigger, screen, panel, notificationObserver: null };
    records.push(record);
    return record;
  }


  // UMT_USER_FIX_PACK_V1: make room-code entry self-explanatory and forgiving.
  function installRoomTools() {
    const details = byId("playRoomTools");
    const panel = byId("cuddleMultiplayerMenuItems");
    const input = byId("joinRoomInput");
    const join = byId("joinRoomBtn");
    const hint = byId("joinRoomHint");

    // Keep the tools with Multiplayer even when a locally edited GROUPS list
    // does not yet mention playRoomTools.
    if (details && panel && details.parentElement !== panel) panel.appendChild(details);
    if (!input || !join || input.__umtRoomToolsBound) return;

    input.__umtRoomToolsBound = true;
    const normalize = value => String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, Number(input.maxLength) || 8);

    const sync = () => {
      const code = normalize(input.value);
      if (input.value !== code) input.value = code;
      const ready = code.length > 0;
      join.disabled = !ready;
      join.setAttribute("aria-disabled", String(!ready));
      if (hint) {
        hint.textContent = ready
          ? `Ready to join ${code}. Press Enter or choose Join room.`
          : "Paste or type the code your friend sent you.";
      }
    };

    input.addEventListener("input", sync);
    input.addEventListener("paste", () => requestAnimationFrame(sync));
    input.addEventListener("focus", () => details?.setAttribute("open", ""));
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter" || join.disabled) return;
      event.preventDefault();
      join.click();
    });
    details?.setAttribute("open", "");
    sync();
  }

  function notificationIsVisible(source) {
    return Boolean(source)
      && !source.hidden
      && source.getAttribute("aria-hidden") !== "true"
      && !source.classList.contains("hidden");
  }

  function connectNotification(record) {
    if (!record?.notificationSourceId) return;
    const source = byId(record.notificationSourceId);
    const mirror = byId("cuddleMultiplayerNotifyBadge");
    if (!source || !mirror) return;

    const sync = () => {
      const visible = notificationIsVisible(source);
      mirror.classList.toggle("hidden", !visible);
      mirror.setAttribute("aria-hidden", String(!visible));
      record.trigger.classList.toggle("has-notification", visible);
      record.trigger.setAttribute(
        "aria-label",
        visible ? `${record.label}, a game needs attention` : record.label
      );
    };
    sync();
    if (typeof MutationObserver === "function") {
      record.notificationObserver = new MutationObserver(sync);
      record.notificationObserver.observe(source, {
        attributes: true,
        attributeFilter: ["class", "hidden", "aria-hidden"],
        childList: true,
        subtree: true
      });
    }
  }

  function redirectGroupedBack(event) {
    const target = event.target instanceof Element ? event.target : null;
    const screen = target?.closest?.(".screen.active");
    const route = screen ? routes.get(screen.id) : null;
    if (!route) return;
    const back = target.closest(route.backSelector);
    if (!back || !screen.contains(back)) return;

    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    showScreenId(route.parentId);
  }

  function preserveMenuTutorial() {
    const core = window.TutorialCore;
    if (!core || typeof core.highlight !== "function" || core.highlight.__cuddleHubWrapped) return;
    const original = core.highlight;
    function wrappedHighlight(element, ...args) {
      const targetScreen = element?.closest?.(".screen");
      if (targetScreen?.id === "startupScreen"
          || records.some(record => record.screen.id === targetScreen?.id)) {
        showScreenId(targetScreen.id);
      }
      return original.call(this, element, ...args);
    }
    wrappedHighlight.__cuddleHubWrapped = true;
    core.highlight = wrappedHighlight;
  }

  function initialize() {
    if (document.documentElement.dataset.cuddleSiteIntegration === "1") return;
    const menu = getStartupMenu();
    if (!menu) return;

    GROUPS.forEach(config => createGroup(menu, config));
    installRoomTools();
    records.forEach(connectNotification);
    preserveMenuTutorial();
    document.addEventListener("click", redirectGroupedBack, true);
    document.documentElement.dataset.cuddleSiteIntegration = "1";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  window.CuddleSiteIntegration = Object.freeze({
    showMultiplayer() { showScreenId("cuddleMultiplayerMenuScreen"); },
    showSinglePlayer() { showScreenId("cuddleSinglePlayerMenuScreen"); }
  });
}());
