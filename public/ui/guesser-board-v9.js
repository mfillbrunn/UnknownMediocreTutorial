(() => {
  "use strict";

  const STORAGE_KEY = "guesserSidebarCollapsedV9";
  const SWIPE_THRESHOLD = 44;
  const byId = id => document.getElementById(id);

  let gesture = null;

  function screen() {
    return byId("guesserScreen");
  }

  function isCollapsed() {
    return !!screen()?.classList.contains("guesser-sidebar-collapsed");
  }

  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function writeStored(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // Storage is optional.
    }
  }

  function ensureStructure() {
    const guesserScreen = screen();
    const workspace = guesserScreen?.querySelector(
      ".guesser-play > .play-row"
    );

    if (!guesserScreen || !workspace) return null;

    workspace.id ||= "guesserWorkspace";
    workspace.classList.add("guesser-workspace");

    const board = workspace.querySelector(":scope > .center-col");
    const sidebar = workspace.querySelector(":scope > .powers-col");

    if (!board || !sidebar) return null;

    board.id ||= "guesserBoard";
    board.classList.add("guesser-board");

    sidebar.id ||= "guesserSidebar";
    sidebar.classList.add("guesser-sidebar");
    sidebar.setAttribute("aria-label", "Guesser side panel");

    const powersRow = sidebar.querySelector(".guesser-powers-row");
    powersRow?.classList.add("guesser-sidebar-content");

    const powerContainer = byId("guesserPowerContainer");
    powerContainer?.setAttribute("aria-label", "Your power and Quest");

    let toggle = byId("guesserSidebarToggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.id = "guesserSidebarToggle";
      toggle.className = "guesser-sidebar-toggle";
      toggle.setAttribute("aria-controls", "guesserSidebar");
      toggle.innerHTML = `
        <span class="guesser-sidebar-toggle-icon" aria-hidden="true">‹</span>
        <span class="guesser-sidebar-toggle-text" aria-hidden="true">Log</span>
        <span id="guesserSidebarChargeMini" class="guesser-sidebar-charge-mini hidden" aria-hidden="true">0</span>
      `;
      workspace.appendChild(toggle);
    }

    let edge = byId("guesserSidebarSwipeEdge");
    if (!edge) {
      edge = document.createElement("div");
      edge.id = "guesserSidebarSwipeEdge";
      edge.className = "guesser-sidebar-swipe-edge";
      edge.setAttribute("aria-hidden", "true");
      workspace.appendChild(edge);
    }

    // Wired here, not only from init()'s one-time call, and guarded per
    // NODE (not per call) via __guesserV9Wired -- ensureStructure() is also
    // called on its own, later, from other modules (quest-charge-v9.js's
    // ensureHud among them) any time they need the sidebar/toggle to exist.
    // If something upstream ever replaces this subtree (the exact failure
    // draftrow.js's own cachedRowsAttached comment documents for the
    // sibling draft row: "anything that replaces the container's contents
    // leaves the property pointing at detached nodes"), byId() above
    // stops finding the old toggle and this function happily creates a
    // fresh one -- but a fresh DOM node has no listeners on it. Wiring
    // only inside init() left a freshly-recreated toggle permanently
    // inert: present, visible, and clickable-looking, but doing nothing,
    // since init() itself never runs a second time to notice the
    // replacement. Wiring every node ensureStructure() itself produces or
    // finds closes that gap regardless of which caller triggered it.
    if (!toggle.__guesserV9Wired) {
      toggle.__guesserV9Wired = true;
      toggle.addEventListener("click", event => {
        event.stopPropagation();
        setCollapsed(!isCollapsed());
      });
    }

    if (!sidebar.__guesserV9Wired) {
      sidebar.__guesserV9Wired = true;
      sidebar.addEventListener("pointerdown", event => beginGesture(event, "close"));
    }

    if (!edge.__guesserV9Wired) {
      edge.__guesserV9Wired = true;
      edge.addEventListener("pointerdown", event => beginGesture(event, "open"));
    }

    if (!window.__guesserDrawerPointerV9) {
      window.__guesserDrawerPointerV9 = true;
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", finishGesture, { passive: true });
      window.addEventListener("pointercancel", finishGesture, { passive: true });
    }

    return { guesserScreen, workspace, board, sidebar, toggle, edge };
  }

  function setCollapsed(collapsed, persist = true) {
    const parts = ensureStructure();
    if (!parts) return;

    const { guesserScreen, toggle } = parts;
    guesserScreen.classList.toggle("guesser-sidebar-collapsed", !!collapsed);
    guesserScreen.dataset.sidebarCollapsed = collapsed ? "true" : "false";

    const icon = toggle.querySelector(".guesser-sidebar-toggle-icon");
    if (icon) icon.textContent = collapsed ? "›" : "‹";

    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Show game log" : "Hide game log"
    );
    toggle.title = collapsed ? "Show side panel" : "Hide side panel";

    if (persist) writeStored(!!collapsed);

    window.updateCollapsedActionDocks?.();
    window.updateQuestChargeV9?.(window.state, window.myRole);
    requestAnimationFrame(() => window.scheduleTutorialLayout?.());
  }

  function beginGesture(event, direction) {
    if (event.pointerType === "mouse" || event.button > 0) return;

    gesture = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      active: false
    };
  }

  function onPointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (!gesture.active) {
      if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      gesture.active = true;
      screen()?.classList.add("guesser-sidebar-swipe-active");
    }

    event.preventDefault();
  }

  function finishGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const current = gesture;
    gesture = null;
    screen()?.classList.remove("guesser-sidebar-swipe-active");

    if (!current.active) return;

    const endX = Number.isFinite(event.clientX) ? event.clientX : current.startX;
    const dx = endX - current.startX;

    if (current.direction === "close" && dx <= -SWIPE_THRESHOLD) {
      setCollapsed(true);
    } else if (current.direction === "open" && dx >= SWIPE_THRESHOLD) {
      setCollapsed(false);
    }
  }

  function init() {
    const parts = ensureStructure();
    if (!parts) return;

    // ensureStructure() itself now wires the toggle/sidebar/edge (and the
    // window-level pointer listeners) as soon as it creates or finds them,
    // so this only needs to seed the initial collapsed/expanded state.
    setCollapsed(readStored(), false);
  }

  window.setGuesserSidebarCollapsed = setCollapsed;
  window.isGuesserSidebarCollapsed = isCollapsed;
  window.ensureGuesserBoardV9 = ensureStructure;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
