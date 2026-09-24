/* CUDDLE WORLDS
 * The three worlds a run climbs through (Whispering Woods, Crystal
 * Caverns, Eclipse Citadel) and the one icon set every screen uses for a
 * stop: the run map, the stop preview, the map key, the shop and the boss
 * entrance all read from here, so a Wordle looks like a Wordle everywhere.
 *
 * Icon kinds are deliberately few: every Wordle variant (classic, themed,
 * Head Start, Lucky Start, Jackpot...) is ONE "wordle" icon -- the label
 * under it says which variant -- and challenge, event, shop, upgrade, duel,
 * mystery and boss each get their own.
 */
(function bootstrapCuddleWorlds() {
  "use strict";

  const WORLDS = Object.freeze([
    Object.freeze({
      index: 0,
      id: "woods",
      name: "Whispering Woods",
      tagline: "Words take root",
      accent: "#8ee6a8",
      glow: "#3ecf8e",
      skyTop: "#0f2a20",
      skyBottom: "#0a1b15",
      bossTitle: "The Woods Stir",
      bossLine: "Something ancient wakes beneath the roots."
    }),
    Object.freeze({
      index: 1,
      id: "caverns",
      name: "Crystal Caverns",
      tagline: "Clues glow in the dark",
      accent: "#a996ff",
      glow: "#6fd8ff",
      skyTop: "#191537",
      skyBottom: "#0e0c22",
      bossTitle: "The Caverns Ring",
      bossLine: "Every crystal hums the same low note."
    }),
    Object.freeze({
      index: 2,
      id: "citadel",
      name: "Eclipse Citadel",
      tagline: "The last answer waits",
      accent: "#ffb36b",
      glow: "#ff5a4f",
      skyTop: "#2e0f15",
      skyBottom: "#16070b",
      bossTitle: "The Eclipse Falls",
      bossLine: "The sun goes dark. The final guardian rises."
    })
  ]);

  // Category colours: the medallion ring and the stop's accent everywhere.
  const KIND_COLORS = Object.freeze({
    wordle: "#3ecf8e",
    challenge: "#ff9f43",
    event: "#b98cff",
    shop: "#f6c956",
    upgrade: "#5ad1ff",
    duel: "#ff7ab6",
    mystery: "#c7bfff",
    boss: "#ff5a6a",
    final: "#ffcf70"
  });

  const KIND_NAMES = Object.freeze({
    wordle: "Wordle",
    challenge: "Challenge",
    event: "Event",
    shop: "Shop",
    upgrade: "Upgrade",
    duel: "Duel",
    mystery: "Unknown",
    boss: "Boss",
    final: "Final Boss"
  });

  const SKULL = '<path d="M12 5c-4.3 0-7.3 2.9-7.3 6.8 0 2.3 1 4 2.4 4.9v3c0 .8.6 1.3 1.3 1.3h7.2c.7 0 1.3-.5 1.3-1.3v-3c1.4-.9 2.4-2.6 2.4-4.9C19.3 7.9 16.3 5 12 5z" fill="#fff1ec"/>'
    + '<path d="M7.8 11.9c0-1 .9-1.6 1.8-1.3l1.1.4c.5.2.6.8.3 1.2l-.9 1.2c-.7.9-2.3.3-2.3-1.5zM16.2 11.9c0-1-.9-1.6-1.8-1.3l-1.1.4c-.5.2-.6.8-.3 1.2l.9 1.2c.7.9 2.3.3 2.3-1.5z" fill="#2a0f14"/>'
    + '<path d="M12 13.9l-.85 1.5h1.7z" fill="#2a0f14"/>'
    + '<path d="M10.1 18v2.6M12 18v2.6M13.9 18v2.6" stroke="#2a0f14" stroke-width=".9"/>';

  // 24x24 artwork. Fixed colours rather than currentColor, so an icon reads
  // the same on the dark map, a light card, or the shop counter.
  const ICONS = Object.freeze({
    wordle:
      '<rect x="2.5" y="2.5" width="8.6" height="8.6" rx="2" fill="#3ecf8e"/>'
      + '<rect x="12.9" y="2.5" width="8.6" height="8.6" rx="2" fill="#f6c956"/>'
      + '<rect x="2.5" y="12.9" width="8.6" height="8.6" rx="2" fill="#8a8f9c"/>'
      + '<rect x="12.9" y="12.9" width="8.6" height="8.6" rx="2" fill="#3ecf8e"/>'
      + '<path d="M4.3 5.2h5M14.7 5.2h5M4.3 15.6h5M14.7 15.6h5" stroke="#fff" stroke-opacity=".45" stroke-width="1.1" stroke-linecap="round"/>',
    challenge:
      '<path d="M13.6 1.8 4.8 13.6h6.3L9.6 22.2l9.6-12.6h-6.4l.8-7.8z" fill="#ff9f43" stroke="#ffd7a8" stroke-width=".9" stroke-linejoin="round"/>',
    event:
      '<rect x="11" y="2.5" width="2" height="19.5" rx="1" fill="#e4d4ff"/>'
      + '<path d="M13 4.5h6.4L22 7.2l-2.6 2.7H13z" fill="#b98cff"/>'
      + '<path d="M11 11.2H4.6L2 13.9l2.6 2.7H11z" fill="#8a64ee"/>'
      + '<path d="M7 22h10" stroke="#e4d4ff" stroke-width="1.6" stroke-linecap="round"/>',
    shop:
      '<rect x="4.2" y="10.5" width="15.6" height="10.8" rx="1.2" fill="#ffe8a3"/>'
      + '<rect x="10" y="14" width="4" height="7.3" rx=".6" fill="#b8862b"/>'
      + '<path d="M3 9.4 4.8 3.8h14.4L21 9.4z" fill="#f6c956"/>'
      + '<path d="M8.4 3.8 7.6 9.4M12 3.8v5.6M15.6 3.8l.8 5.6" stroke="#b8862b" stroke-width="1.2"/>'
      + '<path d="M3 9.4a2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0" fill="#f6c956" stroke="#b8862b" stroke-width=".8"/>',
    upgrade:
      '<path d="M6.2 3.5h11.6L22 9.2 12 21 2 9.2z" fill="#5ad1ff"/>'
      + '<path d="M2 9.2h20M9.2 3.5 7.6 9.2 12 21M14.8 3.5l1.6 5.7L12 21" stroke="#e3f8ff" stroke-width=".9" fill="none" stroke-linejoin="round"/>'
      + '<path d="M6.2 3.5 7.6 9.2 2 9.2z" fill="#9be6ff"/>',
    duel:
      '<path d="M3.5 3.5 14.5 14.5M20.5 3.5 9.5 14.5" stroke="#ffe3ef" stroke-width="2.2" stroke-linecap="round"/>'
      + '<path d="M12.6 16.4l4-4M7.4 12.4l4 4" stroke="#ff7ab6" stroke-width="2.2" stroke-linecap="round"/>'
      + '<path d="M14.8 15 19 19.2M9.2 15 5 19.2" stroke="#ff7ab6" stroke-width="2" stroke-linecap="round"/>'
      + '<circle cx="19.9" cy="20.1" r="1.5" fill="#ffb8d6"/><circle cx="4.1" cy="20.1" r="1.5" fill="#ffb8d6"/>',
    mystery:
      '<circle cx="12" cy="12" r="9.6" fill="#3a3550" stroke="#c7bfff" stroke-width="1.5"/>'
      + '<path d="M9.3 9.5a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2.9-1.2 1.8v.5" stroke="#f1edff" stroke-width="2" fill="none" stroke-linecap="round"/>'
      + '<circle cx="12" cy="17.2" r="1.2" fill="#f1edff"/>',
    boss:
      '<path d="M5.3 8.6C2.7 6.8 2.3 3.6 3.4 1.8c.8 2.6 2.6 3.8 4.8 4.4M18.7 8.6c2.6-1.8 3-5 1.9-6.8-.8 2.6-2.6 3.8-4.8 4.4" fill="#ff5a6a"/>'
      + SKULL,
    final:
      '<path d="M6.4 6.6 5.4 1.6l3.5 2.7L12 .8l3.1 3.5 3.5-2.7-1 5z" fill="#ffcf70" stroke="#b8862b" stroke-width=".6" stroke-linejoin="round"/>'
      + SKULL
  });

  function clampWorld(index) {
    const value = Math.trunc(Number(index));
    return WORLDS[Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 0];
  }

  // The world a map row belongs to: the route stores it as row.act; older
  // saved maps without it count the boss rows below instead.
  function worldForRow(map, rowIndex) {
    const rows = map && Array.isArray(map.rows) ? map.rows : [];
    const row = rows[rowIndex];
    if (row && Number.isFinite(Number(row.act))) return clampWorld(row.act);
    let bosses = 0;
    for (let index = 0; index < rowIndex && index < rows.length; index += 1) {
      const candidate = rows[index];
      if (candidate && (candidate.kind === "boss" || (candidate.nodes || []).some(node => node && node.type === "boss"))) bosses += 1;
    }
    return clampWorld(bosses);
  }

  // The world the player is in right now: one per boss gate cleared.
  function currentWorld(game) {
    const state = game && game.state;
    if (!state) return WORLDS[0];
    const map = state.branchMap;
    if (map && map.position && Number.isFinite(Number(map.position.row))) {
      return worldForRow(map, Number(map.position.row));
    }
    const gates = Array.isArray(state.bossGatesDone) ? state.bossGatesDone.length : 0;
    return clampWorld(gates);
  }

  function kindForNode(node) {
    if (!node) return "wordle";
    switch (String(node.type)) {
      case "challenge": return "challenge";
      case "event": return "event";
      case "shop": return "shop";
      case "upgrade": return "upgrade";
      case "duel": return "duel";
      case "mystery": return node.mysteryRevealed ? kindForNode({ type: node.mysteryType }) : "mystery";
      case "boss": return node.gate === "final" ? "final" : "boss";
      default: return "wordle";
    }
  }

  // Inner markup only, for placing inside an existing <svg> (the map).
  function iconMarkup(kind) {
    return ICONS[kind] || ICONS.wordle;
  }

  // A standalone inline <svg>, for HTML contexts (cards, overlays, shop).
  function iconSvg(kind, className) {
    const key = ICONS[kind] ? kind : "wordle";
    return `<svg class="umt-stage-icon umt-stage-icon-${key}${className ? ` ${className}` : ""}" viewBox="0 0 24 24" `
      + `aria-hidden="true" focusable="false" data-umt-stage-icon="${key}">${ICONS[key]}</svg>`;
  }

  window.CuddleWorlds = Object.freeze({
    WORLDS,
    KIND_COLORS,
    KIND_NAMES,
    worldForRow,
    currentWorld,
    world: clampWorld,
    kindForNode,
    iconMarkup,
    iconSvg
  });
}());
