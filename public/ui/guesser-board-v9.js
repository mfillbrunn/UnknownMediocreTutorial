(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function screen() {
    return byId("guesserScreen");
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

    // The toggle button, the swipe edge, the collapsed state and the swipe
    // itself all belong to ui/sidebar-toggle.js -- one owner, one
    // delegated listener, so no re-render of this subtree can leave a
    // live-looking button with nothing behind it. Ask it to fill in
    // anything this structure pass just created.
    window.refreshSidebarToggles?.();

    const toggle = byId("guesserSidebarToggle");
    const edge = byId("guesserSidebarSwipeEdge");

    return { guesserScreen, workspace, board, sidebar, toggle, edge };
  }

  // Guesser-side follow-ups for a panel move owned by ui/sidebar-toggle.js.
  document.addEventListener("umt:sidebartoggle", event => {
    if (event.detail?.role !== "guesser") return;
    window.updateQuestChargeV9?.(window.state, window.myRole);
  });

  function init() {
    ensureStructure();
  }

  window.ensureGuesserBoardV9 = ensureStructure;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
