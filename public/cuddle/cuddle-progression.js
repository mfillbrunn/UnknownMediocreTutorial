// public/cuddle/cuddle-progression.js
//
// Two things that make a Cuddle run FEEL like it is going somewhere:
//
//   1. The stage-intro banner. When a stage begins, a banner sweeps in
//      under the header saying where you are (world, stage, what kind of
//      stop), what makes it harder or easier, and what it pays -- points in
//      green, money in gold, always in that order -- then whooshes away by
//      itself. It replaces the old dismiss-it-yourself toast at the bottom.
//
//   2. The talent board. Every upgrade the run can collect, as jigsaw
//      pieces in one panel per theme (Scoring, Economy, Insight...), plus
//      panels for the combos and the boss rewards. What you own lights up
//      in its panel's colour. Whenever you pick something up -- a round
//      reward, a boss reward, the starting bonus, a coach upgrade -- the
//      board opens on its own, the new piece drops in gold, and a
//      before/after list shows exactly which of your stats moved.
//
// Cuddle only. Everything here reads game state; the only writes are the
// banner's "already shown" marker, clearing the notices the banner takes
// over, and recording picks the older reward layers forgot to log (see
// installLedgerBackstop).
(function () {
  "use strict";

  const HOST_ID = "umtProgressHost";

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function reducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_error) {
      return false;
    }
  }

  function host() {
    let el = document.getElementById(HOST_ID);
    if (el) return el;
    const screen = document.getElementById("cuddleScreen");
    if (!screen) return null;
    el = document.createElement("div");
    el.id = HOST_ID;
    el.className = "umt-progress-host";
    screen.appendChild(el);
    return el;
  }

  function saveGame(game) {
    try {
      if (game && typeof game.save === "function") game.save();
    } catch (_error) {
      // A failed save only means the marker doesn't persist.
    }
  }

  function ledger(game) {
    const list = game && game.state && game.state.rewardBookHistory;
    return Array.isArray(list) ? list : [];
  }

  function difficultyOf(game) {
    const mega = game && game.state && (game.state.megaState || game.state.mega);
    return String((mega && mega.difficulty) || "hard");
  }

  // ---------------------------------------------------------------------
  // Stats -- what a pick can move, and how the reveal reports it
  // ---------------------------------------------------------------------

  const STAT_DEFS = [
    { key: "handSize", group: "Hand", label: "Hand size", get: (r) => r.handSize },
    { key: "mulligans", group: "Hand", label: "Mulligans per stage", get: (r) => r.mulligans },
    { key: "mulliganSize", group: "Hand", label: "Cards per mulligan", get: (r) => r.mulliganSize },
    { key: "guessRows", group: "Hand", label: "Guess rows", get: (r, s) => 6 + num((s.megaState || {}).extraGuesses) },
    { key: "jokers", group: "Hand", label: "Jokers per stage", get: (r, s) => num((s.megaState || {}).jokerPerRoundBonus) },
    { key: "greenPoints", group: "Scoring", label: "Green tile", unit: "pts", get: (r) => r.greenPoints },
    { key: "yellowPoints", group: "Scoring", label: "Yellow tile", unit: "pts", get: (r) => r.yellowPoints },
    { key: "greyPoints", group: "Scoring", label: "Grey tile", unit: "pts", get: (r) => r.greyPoints },
    { key: "earlyPoint", group: "Scoring", label: "Per spare guess", unit: "pts", get: (r) => r.earlyPoint },
    { key: "mulliganPoints", group: "Scoring", label: "Per unused mulligan", unit: "pts", get: (r) => r.mulliganPoints },
    { key: "openingPoints", group: "Scoring", label: "Stage-start points", unit: "pts", get: (r, s) => num((s.cuddleBonuses || {}).storybookStart) * 10 },
    { key: "specialTiles", group: "Board", label: "Extra special tiles", get: (r, s) => num((s.cuddleBonuses || {}).treasureMap) },
    { key: "mulliganTiles", group: "Board", label: "Mulligan tiles", get: (r, s) => num((s.cuddleBonuses || {}).mulliganTiles) },
    { key: "jokerTiles", group: "Board", label: "Joker tiles", get: (r, s) => num((s.cuddleBonuses || {}).jokerTiles) },
    { key: "oracleTiles", group: "Board", label: "Oracle tiles", get: (r, s) => num((s.cuddleBonuses || {}).oracleTiles) },
    { key: "questPoints", group: "Quests", label: "Quest value", unit: "pts", get: (r) => r.questPoints },
    { key: "questSlots", group: "Quests", label: "Quests at once", get: (r) => r.questSlots },
    { key: "questRefreshes", group: "Quests", label: "Reward refreshes", get: (r) => r.questRefreshes }
  ];

  function readStats(game) {
    const out = {};
    if (!game || !game.state) return out;
    let rules = {};
    try {
      rules = game.getRulesSummary() || {};
    } catch (_error) {
      rules = {};
    }
    for (const def of STAT_DEFS) {
      try {
        out[def.key] = num(def.get(rules, game.state));
      } catch (_error) {
        out[def.key] = 0;
      }
    }
    return out;
  }

  function statDiff(before, after) {
    return STAT_DEFS
      .filter((def) => before && after && before[def.key] !== after[def.key])
      .map((def) => ({ def, from: before[def.key], to: after[def.key] }));
  }

  // ---------------------------------------------------------------------
  // Tree model
  // ---------------------------------------------------------------------

  // The six branches the radial tree fans into. These are themes, not the
  // catalogue's own grouping by where a reward comes from: "Round Rewards"
  // alone holds twenty-odd upgrades, far too many for one branch to read.
  // Anything not listed falls into a branch by its catalogue category.
  const WEDGES = [
    { id: "scoring", title: "Scoring", color: "#8ff7cd", angle: -150,
      ids: ["storybookStart", "earlySolveBoost", "mulliganValueBoost", "greyPointBoost", "colourTrade", "greyscale"] },
    { id: "economy", title: "Economy", color: "#f6c956", angle: -90,
      ids: ["rainyDay", "encore", "hotStreak", "vowelBounty", "doubleDown", "reserveDividend", "treasureMap", "mulliganTiles", "jokerTiles", "oracleTiles"] },
    { id: "solving", title: "Solving Aids", color: "#7cb8ff", angle: -30, easyOnly: true,
      ids: ["openingInsight", "quickStudy", "consonantSweep"] },
    { id: "coach", title: "Cuddle Coach", color: "#ff9ec7", angle: 30,
      ids: ["coachPossibleAnswers", "coachHint", "coachEarlierHint", "coachMeterThreshold", "coachMeterReward"] },
    { id: "quests", title: "Quests", color: "#f6a94a", angle: 90,
      ids: ["questPoints", "questRefreshes", "questReroll", "surprise-assignment"] },
    { id: "hand", title: "Hand & Tools", color: "#d5a6ff", angle: 150,
      ids: ["extraMulligans", "mulliganSize", "handSizeBoost", "jokerPerRound", "jokerCache", "wideChoice", "rewardEcho", "removeLetter", "greenCount", "categorySense", "alphabet-compass"] },
    { id: "insight", title: "Insight", color: "#9ee86f", angle: 180,
      ids: ["vowelLamp", "echoFinder", "patternLens", "deadLetter", "lastLight", "treasureHunter", "mistakeShield"] }
  ];
  const CATEGORY_WEDGE = { economy: "economy", solving: "solving", quests: "quests", easierStages: "hand", insight: "insight" };
  const COMBO_COLOR = "#ff7ab8";
  const BOSS_COLOR = "#fb7185";
  // Bronze / silver / gold, as on the reward cards' rarity badges.
  const TIER_STROKE = { common: "#c98a4b", rare: "#c6d0de", epic: "#b98cff", legendary: "#f6c956" };
  const TIER_NAME = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
  // Talents the shop's permanent shelf sells (cuddle-shop.js KEEP items).
  const SHOP_TALENTS = new Set(["coachPossibleAnswers", "coachHint", "coachMeterThreshold", "treasureMap", "mulliganTiles", "jokerTiles", "oracleTiles"]);
  // Boss rewards that can also be a Legendary between-round pick
  // (cuddle-economy-rarity-v8.js LEGENDARY_PICKS).
  const LEGENDARY_PICK_IDS = new Set(["doubleMulligans", "cullRare", "freeVowelSweep", "questHead", "questDoublePick",
    "questPersistReward", "goldenCompass", "secondCup", "allThemesBoss", "umtAllThemes", "jokerCache", "umtJokerCache"]);

  const R_HUB = 100;
  const ARC_RADII = [178, 246, 314];
  const R_COMBO = 372;
  const R_BOSS = 424;

  // Reward ids come in a few spellings across the add-on layers
  // ("umtRainyDay" for the tree's "rainyDay"); fold them together.
  function canonicalId(id) {
    const raw = String(id || "");
    const stripped = raw.replace(/^umt(?=[A-Z])/, "");
    return stripped ? stripped.charAt(0).toLowerCase() + stripped.slice(1) : raw;
  }

  function resolveCatalogueNode(tree, id, title) {
    if (!tree) return null;
    return tree.findNode(id)
      || tree.findNode(canonicalId(id))
      || (title ? tree.findNodeByName(title) : null)
      || null;
  }

  function polar(radius, degrees) {
    const rad = (degrees * Math.PI) / 180;
    return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  // Spread n nodes over the wedge's three arcs, innermost first, with the
  // arcs offset from each other so the fan reads as grown rather than
  // gridded.
  function layoutWedge(wedge, count) {
    const perArc = [0, 0, 0];
    for (let i = 0; i < count; i += 1) perArc[i % 3] += 1;
    perArc.sort((a, b) => a - b);
    const spots = [];
    perArc.forEach((onArc, arcIndex) => {
      const spread = onArc >= 4 ? 25 : onArc === 3 ? 21 : onArc === 2 ? 12 : 0;
      const stagger = arcIndex === 1 && onArc > 1 ? 3 : arcIndex === 2 && onArc > 1 ? -3 : 0;
      for (let j = 0; j < onArc; j += 1) {
        const t = onArc === 1 ? 0 : (j / (onArc - 1)) * 2 - 1;
        const angle = wedge.angle + t * spread + stagger;
        spots.push({ ...polar(ARC_RADII[arcIndex], angle), angle, radius: ARC_RADII[arcIndex] });
      }
    });
    return spots;
  }

  function circularMean(angles) {
    let x = 0;
    let y = 0;
    angles.forEach((a) => {
      x += Math.cos((a * Math.PI) / 180);
      y += Math.sin((a * Math.PI) / 180);
    });
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  // Everything the tree draws, derived fresh each time: the catalogue plus
  // everything this run has actually picked up -- so a pick can never be
  // missing from the tree just because the catalogue didn't know about it.
  function buildModel(game) {
    const tree = window.CuddleSkillTree;
    const nodes = new Map();
    const easy = difficultyOf(game) === "easy";

    const addNode = (base, extra) => {
      if (!base || nodes.has(base.id)) return nodes.get(base && base.id);
      const node = {
        id: base.id,
        title: base.title || base.id,
        icon: base.icon || "✦",
        tier: base.tier || "common",
        category: base.category || "",
        description: base.description || "",
        maxLevel: Number.isFinite(base.maxLevel) ? base.maxLevel : null,
        requires: Array.isArray(base.requires) ? base.requires.slice() : null,
        easyOnly: Boolean(base.easyOnly),
        kind: "upgrade",
        wedge: null,
        level: 0,
        picks: [],
        ...extra
      };
      nodes.set(node.id, node);
      return node;
    };

    if (tree) {
      for (const branch of tree.BRANCHES) {
        for (const base of branch.nodes) {
          const kind = branch.id === "bossRewards" ? "boss" : branch.id === "synergyCombos" ? "combo" : "upgrade";
          addNode(base, { kind, branch: branch.id, easyOnly: Boolean(base.easyOnly || branch.easyOnly) });
        }
      }
    }

    // Deliberately NOT unioned with game._upgradeCatalog(): building that
    // list draws from the run's seeded random stream (a Cull's letters are
    // rolled every call), so reading it on every render would change what
    // the run offers later. Anything picked that the catalogue doesn't know
    // still appears -- the ledger pass below adds it.

    // Light it all from the acquisition ledger -- not from the upgrade
    // counters, several of which are shared between two different rewards
    // (Golden Value and Richer Colours both add to yellowPoints) and would
    // light a node the player never picked.
    ledger(game).forEach((entry, index) => {
      if (!entry) return;
      let node = resolveCatalogueNode(tree, entry.id, entry.title);
      node = node ? nodes.get(node.id) : null;
      if (!node) {
        node = nodes.get(entry.id) || addNode({
          id: entry.id,
          title: entry.title,
          icon: entry.icon,
          description: entry.description
        }, { kind: entry.kind === "boss" ? "boss" : "upgrade" });
      }
      node.level += 1;
      node.picks.push({ round: num(entry.round, 1), kind: entry.kind || "round", order: index });
    });

    // Combos are owned when both halves are.
    nodes.forEach((node) => {
      if (node.kind !== "combo" || !node.requires) return;
      const reqs = node.requires.map((id) => nodes.get(id) || nodes.get(canonicalId(id)));
      node.reqNodes = reqs.filter(Boolean);
      node.level = node.reqNodes.length === node.requires.length && node.reqNodes.every((n) => n.level > 0) ? 1 : 0;
      // A half granted outside the pick ledger still counts when the combo
      // registry says the combo is on.
      const synergies = window.CuddleSynergies;
      if (!node.level && synergies && typeof synergies.owns === "function") {
        try { if (synergies.owns(game, node.id)) node.level = 1; } catch (_error) { /* not a registry combo */ }
      }
    });

    // Place upgrades into wedges.
    const wedgeNodes = new Map(WEDGES.map((w) => [w.id, []]));
    nodes.forEach((node) => {
      if (node.kind !== "upgrade") return;
      const canon = canonicalId(node.id);
      const listed = WEDGES.find((w) => w.ids.includes(node.id) || w.ids.includes(canon));
      const wedgeId = listed ? listed.id : (CATEGORY_WEDGE[node.category] || (node.easyOnly ? "solving" : "hand"));
      node.wedge = wedgeId;
      wedgeNodes.get(wedgeId).push(node);
    });
    WEDGES.forEach((wedge) => {
      const list = wedgeNodes.get(wedge.id);
      // Catalogue order within the listed ids, extras after.
      list.sort((a, b) => {
        const ai = wedge.ids.indexOf(a.id) >= 0 ? wedge.ids.indexOf(a.id) : wedge.ids.indexOf(canonicalId(a.id));
        const bi = wedge.ids.indexOf(b.id) >= 0 ? wedge.ids.indexOf(b.id) : wedge.ids.indexOf(canonicalId(b.id));
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });
      const spots = layoutWedge(wedge, list.length);
      list.forEach((node, i) => Object.assign(node, spots[i]));
      wedge.hub = polar(R_HUB, wedge.angle);
      wedge.nodes = list;
      wedge.locked = Boolean(wedge.easyOnly && !easy);
      wedge.owned = list.filter((n) => n.level > 0).length;
    });

    // Combos sit outside the fans, between the two upgrades they need.
    const combos = [...nodes.values()].filter((n) => n.kind === "combo");
    combos.forEach((combo) => {
      const angles = (combo.reqNodes || []).filter((n) => Number.isFinite(n.angle)).map((n) => n.angle);
      combo.angle = angles.length ? circularMean(angles) : -90;
    });
    combos.sort((a, b) => a.angle - b.angle);
    for (let i = 1; i < combos.length; i += 1) {
      if (combos[i].angle - combos[i - 1].angle < 15) combos[i].angle = combos[i - 1].angle + 15;
    }
    combos.forEach((combo) => Object.assign(combo, polar(R_COMBO, combo.angle), { radius: R_COMBO }));

    // Boss rewards ring the whole tree.
    const bosses = [...nodes.values()].filter((n) => n.kind === "boss");
    bosses.forEach((boss, i) => {
      const angle = -90 + (360 / Math.max(1, bosses.length)) * (i + 0.5);
      Object.assign(boss, polar(R_BOSS, angle), { angle, radius: R_BOSS });
    });

    const all = [...nodes.values()].filter((n) => Number.isFinite(n.x));
    // An Easy-only talent drops out of the count on other difficulties --
    // unless the run owns it anyway, which always counts.
    const countable = all.filter((n) => !(n.easyOnly && !easy) || n.level > 0);
    return {
      nodes,
      all,
      wedges: WEDGES,
      combos,
      bosses,
      owned: countable.filter((n) => n.level > 0).length,
      total: countable.length,
      easy
    };
  }

  // ---------------------------------------------------------------------
  // Tree SVG
  // ---------------------------------------------------------------------

  function nodeColor(node) {
    if (node.kind === "boss") return BOSS_COLOR;
    if (node.kind === "combo") return COMBO_COLOR;
    const wedge = WEDGES.find((w) => w.id === node.wedge);
    return wedge ? wedge.color : "#d5a6ff";
  }

  // ---------------------------------------------------------------------
  // Talent board: one panel per theme, each a little jigsaw of its talents
  // ---------------------------------------------------------------------

  const PANELS = [
    { id: "scoring", tagline: "Make every tile count.", icon: "star" },
    { id: "economy", tagline: "Coins in, coins out.", icon: "moneyBag" },
    { id: "insight", tagline: "See more. Guess smarter.", icon: "eye" },
    { id: "hand", tagline: "Better cards, better tools.", icon: "toolbox" },
    { id: "quests", tagline: "Side goals, real rewards.", icon: "clipboard" },
    { id: "coach", tagline: "Your coach in the corner.", icon: "pinkHeart" },
    { id: "solving", tagline: "Gentle nudges, on Easy only.", icon: "bulb" },
    { id: "combos", title: "Combos", tagline: "Two halves, one bonus.", icon: "link", color: COMBO_COLOR },
    { id: "bosses", title: "Boss Rewards", tagline: "Taken from the bosses you beat.", icon: "trophy", color: BOSS_COLOR }
  ];

  // Piece geometry, in board units: a square cell, plus room on every side
  // for the tabs that stick out of it.
  const CELL = 100;
  const TAB = 27;
  const BOX = CELL + TAB * 2;
  // One tab, drawn along an edge from u=0 to u=1 and sticking out by v (in
  // cells). Symmetric about u=0.5, so the neighbour that draws the same
  // edge the other way round traces exactly the same curve.
  const TAB_CURVE = [
    ["L", [0.36, 0]],
    ["C", [0.40, 0], [0.42, 0.05], [0.39, 0.10]],
    ["C", [0.34, 0.17], [0.38, 0.25], [0.50, 0.25]],
    ["C", [0.62, 0.25], [0.66, 0.17], [0.61, 0.10]],
    ["C", [0.58, 0.05], [0.60, 0], [0.64, 0]],
    ["L", [1, 0]]
  ];

  // sign: +1 a tab sticking out, -1 a blank cut in, 0 a flat edge.
  function edgePath(x0, y0, x1, y1, sign) {
    if (!sign) return `L${round1(x1)} ${round1(y1)}`;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    // The outward normal of a clockwise outline in screen coordinates.
    const nx = dy / len;
    const ny = -dx / len;
    const at = ([u, v]) => `${round1(x0 + dx * u + nx * v * CELL * sign)} ${round1(y0 + dy * u + ny * v * CELL * sign)}`;
    return TAB_CURVE.map(([cmd, ...points]) => cmd + points.map(at).join(" ")).join("");
  }

  function piecePath(edges) {
    const a = TAB;
    const b = TAB + CELL;
    return `M${a} ${a}` + edgePath(a, a, b, a, edges.top) + edgePath(b, a, b, b, edges.right)
      + edgePath(b, b, a, b, edges.bottom) + edgePath(a, b, a, a, edges.left) + "Z";
  }

  function hash32(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // Which way each shared edge's tab points is fixed per panel and edge, so
  // a panel's puzzle keeps its shape from one opening to the next.
  function tabSign(panelId, key) {
    return hash32(`${panelId}:${key}`) % 2 ? 1 : -1;
  }

  function columnsFor(count) {
    if (count <= 4) return Math.max(2, count);
    if (count <= 9) return 3;
    return 4;
  }

  // Cells for n pieces: rows filled left to right, a short last row centred.
  function cellsFor(count, cols) {
    const cells = [];
    const rows = Math.ceil(count / cols);
    for (let row = 0; row < rows; row += 1) {
      const inRow = Math.min(cols, count - row * cols);
      const offset = Math.floor((cols - inRow) / 2);
      for (let i = 0; i < inRow; i += 1) cells.push({ row, col: offset + i });
    }
    return { cells, rows };
  }

  function pieceIcon(icon) {
    const text = String(icon || "✦");
    const Icons = window.CuddleIcons;
    if (Icons && Icons.hasEmoji(text)) return `<span class="umt-pz-icon">${Icons.svg(text)}</span>`;
    return `<span class="umt-pz-icon is-text">${esc(text)}</span>`;
  }

  function piecePips(node) {
    const max = node.maxLevel;
    if (!max || max < 2) return node.level > 1 ? `<span class="umt-pz-stack">×${node.level}</span>` : "";
    let dots = "";
    for (let i = 0; i < max; i += 1) dots += `<i class="${i < node.level ? "is-on" : ""}"></i>`;
    return `<span class="umt-pz-pips" aria-hidden="true">${dots}</span>`;
  }

  // "1/2" on a half-built combo, "✓" on a complete one.
  function pieceBadge(node) {
    if (node.kind !== "combo" || !node.requires) return "";
    const need = node.requires.length;
    const have = (node.reqNodes || []).filter((req) => req.level > 0).length;
    return `<span class="umt-pz-badge${node.level > 0 ? " is-done" : have ? " is-half" : ""}">${node.level > 0 ? "✓" : `${have}/${need}`}</span>`;
  }

  function panelMarkup(panel, nodes, model, view) {
    if (!nodes.length) return "";
    const fresh = view.freshIds || new Set();
    const cols = columnsFor(nodes.length);
    const { cells, rows } = cellsFor(nodes.length, cols);
    // Outer edges are always flat, so the puzzle box is just the cells; each
    // piece's box overhangs it by a tab's depth on every side.
    const width = cols * CELL;
    const height = rows * CELL;
    const byCell = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
    const has = (row, col) => byCell.has(`${row}:${col}`);
    const owned = nodes.filter((node) => node.level > 0).length;
    const wedge = WEDGES.find((w) => w.id === panel.id) || {};
    const color = panel.color || wedge.color || "#d5a6ff";
    const title = panel.title || wedge.title || panel.id;
    const Icons = window.CuddleIcons;
    const pieces = nodes.map((node, index) => {
      const { row, col } = cells[index];
      const edges = {
        top: has(row - 1, col) ? -tabSign(panel.id, `h${row - 1}:${col}`) : 0,
        bottom: has(row + 1, col) ? tabSign(panel.id, `h${row}:${col}`) : 0,
        left: has(row, col - 1) ? -tabSign(panel.id, `v${row}:${col - 1}`) : 0,
        right: has(row, col + 1) ? tabSign(panel.id, `v${row}:${col}`) : 0
      };
      const isOwned = node.level > 0;
      const locked = node.easyOnly && !model.easy && !isOwned;
      const state = fresh.has(node.id) ? "is-fresh" : isOwned ? "is-owned" : locked ? "is-locked" : "is-open";
      const status = isOwned ? `yours${node.level > 1 ? `, level ${node.level}` : ""}` : locked ? "Easy difficulty only" : "not yet";
      const style = `left:${round1(((col * CELL - TAB) / width) * 100)}%;top:${round1(((row * CELL - TAB) / height) * 100)}%;`
        + `width:${round1((BOX / width) * 100)}%;height:${round1((BOX / height) * 100)}%;`
        + `--t:${TIER_STROKE[node.tier] || TIER_STROKE.common};--i:${index}`;
      return `<button type="button" class="umt-pz-piece ${state}${node.id === view.selectedId ? " is-selected" : ""}" data-umt-node="${esc(node.id)}"`
        + ` style="${style}" aria-label="${esc(node.title)}, ${status}">`
        + `<svg class="umt-pz-shape" viewBox="0 0 ${BOX} ${BOX}" preserveAspectRatio="none" aria-hidden="true"><path d="${piecePath(edges)}"/></svg>`
        + `<span class="umt-pz-face">`
        + (locked ? `<span class="umt-pz-icon">${Icons ? Icons.svg("lock") : ""}</span>` : pieceIcon(node.icon))
        + `<span class="umt-pz-name">${esc(node.title)}</span>`
        + piecePips(node)
        + `</span>`
        + pieceBadge(node)
        + `</button>`;
    }).join("");
    return `<section class="umt-pz-panel${owned ? " has-owned" : ""}" style="--c:${color}" aria-label="${esc(title)}">`
      + `<header class="umt-pz-head"><span class="umt-pz-panel-icon">${Icons ? Icons.svg(panel.icon) : ""}</span>`
      + `<div><h3>${esc(title)}</h3><p>${esc(panel.tagline)}</p></div>`
      + `<span class="umt-pz-count">${owned}<small>/${nodes.length}</small></span></header>`
      + `<div class="umt-pz-puzzle" style="aspect-ratio:${width} / ${height};--cols:${cols}">${pieces}</div>`
      + `</section>`;
  }

  function renderBoard(model, view) {
    return PANELS.map((panel) => {
      let nodes;
      if (panel.id === "combos") nodes = model.combos;
      else if (panel.id === "bosses") nodes = model.bosses;
      else nodes = (model.wedges.find((w) => w.id === panel.id) || {}).nodes || [];
      return panelMarkup(panel, nodes, model, view);
    }).join("");
  }

  // ---------------------------------------------------------------------
  // Tree overlay (browse + reveal)
  // ---------------------------------------------------------------------

  const view = {
    open: false,
    mode: "browse",
    selectedId: null,
    freshIds: new Set(),
    reveal: null,
    game: null,
    lastFocus: null
  };

  function stageLabel(round) {
    return `Stage ${Math.max(1, num(round, 1))}`;
  }

  function detailMarkup(model, node) {
    if (!node) {
      return `<div class="umt-pt-detail is-empty"><p>Tap any piece to see what it does and how to get it. Lit pieces are yours; the edge colour is its rarity (see Key).</p></div>`;
    }
    const owned = node.level > 0;
    const wedge = WEDGES.find((w) => w.id === node.wedge);
    const branch = node.kind === "boss" ? "Boss reward" : node.kind === "combo" ? "Synergy combo" : (wedge ? wedge.title : "Upgrade");
    const tier = node.tier ? node.tier.charAt(0).toUpperCase() + node.tier.slice(1) : "";
    const levelText = node.maxLevel && node.maxLevel > 1
      ? `Level ${node.level} of ${node.maxLevel}`
      : owned ? (node.level > 1 ? `Taken ${node.level} times` : "Owned") : "";
    const when = node.picks.length
      ? `<p class="umt-pt-when">Picked up on ${node.picks.map((p) => stageLabel(p.round)).join(", ")}</p>`
      : "";
    const reqs = node.kind === "combo" && node.reqNodes
      ? `<ul class="umt-pt-reqs">${node.reqNodes.map((req) => `<li class="${req.level > 0 ? "is-met" : ""}"><span aria-hidden="true">${req.level > 0 ? "✓" : "○"}</span>${esc(req.title)}</li>`).join("")}</ul>`
      : "";
    const locked = node.easyOnly && !model.easy && !owned
      ? `<p class="umt-pt-when">Only offered on Easy difficulty.</p>` : "";
    const howTo = howToGet(node);
    const next = node.maxLevel && node.maxLevel > 1 && node.level < node.maxLevel
      ? (owned
        ? `Can be taken ${node.maxLevel - node.level} more time${node.maxLevel - node.level === 1 ? "" : "s"}; each one stacks the effect again.`
        : `Stacks: can be taken up to ${node.maxLevel} times.`)
      : node.maxLevel && node.maxLevel > 1 && owned ? "Fully stacked." : "";
    return `<div class="umt-pt-detail${owned ? " is-owned" : ""}" style="--c:${nodeColor(node)}">`
      + `<div class="umt-pt-detail-head"><span class="umt-pt-detail-icon">${esc(node.icon)}</span>`
      + `<div><strong>${esc(node.title)}</strong><span class="umt-pt-detail-meta">${esc(branch)}${tier ? ` · ${esc(tier)}` : ""}</span></div>`
      + `<span class="umt-pt-state ${owned ? "is-owned" : ""}">${owned ? (levelText || "Owned") : "Not yet"}</span></div>`
      + `<p>${esc(node.description || "")}</p>`
      + (owned && node.maxLevel > 1 ? `<p class="umt-pt-when">${esc(levelText)}</p>` : "")
      + when + reqs + locked
      + `<div class="umt-pt-howto"><h4>How to get it</h4><ul>${howTo.concat(next ? [next] : []).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
      + `</div>`
      + `</div>`;
  }

  // Boss rewards that are also between-round picks: these four come up as
  // Epic, the rest as Legendary (cuddle-economy-rarity-v8.js).
  const EPIC_PICK_IDS = new Set(["doubleMulligans", "freeVowelSweep", "questHead", "secondCup"]);
  function pickTierName(id) {
    return EPIC_PICK_IDS.has(id) ? "an Epic" : "a Legendary";
  }

  function howToGet(node) {
    const tier = TIER_NAME[node.tier] || "";
    const lines = [];
    if (node.kind === "combo") {
      const reqs = node.reqNodes || [];
      const have = reqs.filter((req) => req.level > 0).length;
      lines.push(`Own both ${reqs.map((req) => req.title).join(" and ")}; it turns on by itself.`);
      lines.push(node.level > 0 ? "Both halves owned: active." : `${have} of ${node.requires ? node.requires.length : 2} owned.`);
      return lines;
    }
    if (node.kind === "boss") {
      lines.push("Boss reward: pick the boss that offers it and clear that boss.");
      if (LEGENDARY_PICK_IDS.has(node.id)) lines.push(`Can also show up as ${pickTierName(node.id)} between-round reward.`);
      return lines;
    }
    if (node.branch === "cuddleCoach") {
      lines.push("Bought in the shop, on its permanent shelf.");
    } else {
      lines.push(`Between-round reward${tier ? ` (${tier})` : ""}: offered on the reward screen after a stage.`);
      if (SHOP_TALENTS.has(node.id)) lines.push("Also sold on the shop's permanent shelf.");
    }
    if (LEGENDARY_PICK_IDS.has(node.id) && node.tier !== "legendary") lines.push(`Can also show up as ${pickTierName(node.id)} reward.`);
    if (node.easyOnly) lines.push("Only offered on Easy difficulty.");
    return lines;
  }

  // What the piece colours mean.
  function legendMarkup() {
    const tier = (id) => `<span class="umt-pt-key-ring" style="--t:${TIER_STROKE[id]}"></span>${TIER_NAME[id]} edge`;
    return `<details class="umt-pt-key"><summary>Key</summary><ul>`
      + `<li><span class="umt-pz-key is-owned"></span>Yours</li>`
      + `<li><span class="umt-pz-key is-fresh"></span>Just picked up</li>`
      + `<li><span class="umt-pz-key is-open"></span>Not yet</li>`
      + `<li><span class="umt-pz-key is-locked"></span>Easy only</li>`
      + `<li>${tier("common")}</li><li>${tier("rare")}</li><li>${tier("epic")}</li><li>${tier("legendary")}</li>`
      + `<li><span class="umt-pt-key-badge">1/2</span>Combo: halves owned</li>`
      + `</ul></details>`;
  }

  function statsMarkup(stats, changed) {
    const changedKeys = new Map((changed || []).map((c) => [c.def.key, c]));
    const groups = [];
    for (const def of STAT_DEFS) {
      let group = groups.find((g) => g.name === def.group);
      if (!group) {
        group = { name: def.group, rows: [] };
        groups.push(group);
      }
      const change = changedKeys.get(def.key);
      const value = stats[def.key];
      const unit = def.unit ? `<small>${def.unit}</small>` : "";
      const delta = change ? change.to - change.from : 0;
      group.rows.push(
        `<li class="${change ? (delta > 0 ? "is-up" : "is-down") : ""}"><span>${esc(def.label)}</span>`
        + (change
          ? `<b><s>${change.from}</s><i aria-hidden="true">→</i>${change.to}${unit}</b>`
          : `<b>${value}${unit}</b>`)
        + `</li>`
      );
    }
    return `<div class="umt-pt-stats">${groups.map((g) => `<section><h4>${esc(g.name)}</h4><ul>${g.rows.join("")}</ul></section>`).join("")}</div>`;
  }

  function timelineMarkup(model, game) {
    const entries = ledger(game);
    if (!entries.length) return "";
    const tree = window.CuddleSkillTree;
    const chips = entries.map((entry) => {
      const cat = resolveCatalogueNode(tree, entry.id, entry.title);
      const id = cat ? cat.id : entry.id;
      const node = model.nodes.get(id);
      const color = node ? nodeColor(node) : "#d5a6ff";
      return `<button type="button" class="umt-pt-chip" data-umt-node="${esc(id)}" style="--c:${color}">`
        + `<small>S${Math.max(1, num(entry.round, 1))}</small><span aria-hidden="true">${esc((node && node.icon) || entry.icon || "✦")}</span>${esc(entry.title || "Reward")}</button>`;
    }).join("");
    return `<div class="umt-pt-timeline"><h4>Your picks, in order</h4><div class="umt-pt-chips">${chips}</div></div>`;
  }

  // The reveal's new ledger entries, one group per talent.
  function revealGroups(model, reveal) {
    const tree = window.CuddleSkillTree;
    const groups = new Map();
    reveal.entries.forEach((entry) => {
      const cat = resolveCatalogueNode(tree, entry.id, entry.title);
      const id = cat ? cat.id : entry.id;
      const group = groups.get(id);
      if (group) group.times += 1;
      else groups.set(id, { entry, node: model.nodes.get(id), times: 1 });
    });
    return [...groups.values()];
  }

  // A combo unlocked by this pick: its two halves slide together, flash,
  // and become the combo, with what it now does underneath.
  function comboEffect(combo) {
    const listed = window.CuddleSynergies && Array.isArray(window.CuddleSynergies.combos)
      ? window.CuddleSynergies.combos.find((item) => item.id === combo.id) : null;
    if (listed && listed.effect) return listed.effect;
    const text = String(combo.description || "");
    return text.includes(": ") ? text.slice(text.indexOf(": ") + 2) : text;
  }

  function fusionMarkup(combo) {
    const parts = (combo.reqNodes || []).slice(0, 2);
    const part = (node, side) => `<span class="umt-pt-fusion-part is-${side}" style="--c:${nodeColor(node)}" title="${esc(node.title)}">${esc(node.icon || "✦")}</span>`;
    const names = parts.map((node) => esc(node.title)).join(" + ");
    return `<div class="umt-pt-fusion" style="--c:${COMBO_COLOR}" role="status">`
      + `<div class="umt-pt-fusion-stage" aria-hidden="true">`
      + (parts[0] ? part(parts[0], "left") : "")
      + (parts[1] ? part(parts[1], "right") : "")
      + `<span class="umt-pt-fusion-flash"></span>`
      + `<span class="umt-pt-fusion-result">${esc(combo.icon || "✨")}</span>`
      + `</div>`
      + `<div class="umt-pt-fusion-copy"><small>Combo unlocked</small><strong>${esc(combo.title)}</strong>`
      + (names ? `<em>${names}</em>` : "")
      + `<p>${esc(comboEffect(combo))}</p></div></div>`;
  }

  function revealMarkup(model, reveal) {
    if (!reveal) return "";
    const tree = window.CuddleSkillTree;
    const items = revealGroups(model, reveal).map(({ entry, node, times }) => {
      const color = node ? nodeColor(node) : "#d5a6ff";
      const lvl = node && node.maxLevel > 1 ? `<span class="umt-pt-state is-owned">Lv ${node.level}/${node.maxLevel}</span>` : "";
      // Reward Echo and the like apply one pick several times; that's one
      // card with a count, not the same card repeated.
      const echo = times > 1 ? `<span class="umt-pt-state is-echo">×${times}</span>` : "";
      return `<div class="umt-pt-new" style="--c:${color}"><span class="umt-pt-detail-icon">${esc((node && node.icon) || entry.icon || "✦")}</span>`
        + `<div><strong>${esc(entry.title || (node && node.title) || "Reward")}</strong>`
        + `<p>${esc((node && node.description) || entry.description || "")}</p></div>${echo}${lvl}</div>`;
    }).join("");
    const combosNow = model.combos.filter((c) => c.level > 0 && reveal.newComboIds && reveal.newComboIds.has(c.id));
    const comboNote = combosNow.map(fusionMarkup).join("");
    const changes = reveal.diff.length
      ? `<ul class="umt-pt-changes">${reveal.diff.map((c) => {
        const up = c.to > c.from;
        return `<li class="${up ? "is-up" : "is-down"}"><span>${esc(c.def.label)}</span>`
          + `<b><s>${c.from}</s><i aria-hidden="true">→</i>${c.to}${c.def.unit ? `<small>${c.def.unit}</small>` : ""}</b>`
          + `<em>${up ? "+" : ""}${c.to - c.from}</em></li>`;
      }).join("")}</ul>`
      : `<p class="umt-pt-ability">New ability — it changes how stages play rather than a number.</p>`;
    return `<section class="umt-pt-reveal">${items}${comboNote}<h4>${reveal.diff.length ? "What changed" : "Effect"}</h4>${changes}</section>`;
  }

  function overlayMarkup(game) {
    const model = buildModel(game);
    const stats = readStats(game);
    const reveal = view.mode === "reveal" ? view.reveal : null;
    const selected = view.selectedId ? model.nodes.get(view.selectedId) : null;
    const percent = model.total ? Math.round((model.owned / model.total) * 100) : 0;
    const heading = reveal
      ? `<span class="umt-pt-kicker">Progression</span><h2 id="umtPtTitle">${revealGroups(model, reveal).length > 1 ? "New talents" : "New talent"} added</h2>`
      : `<span class="umt-pt-kicker">Progression</span><h2 id="umtPtTitle">Your run so far</h2>`;
    return `<div class="umt-pt-overlay${reveal ? " is-reveal" : ""}" role="dialog" aria-modal="true" aria-hidden="false" aria-labelledby="umtPtTitle">`
      + `<div class="umt-pt-backdrop" data-umt-pt-close></div>`
      + `<section class="umt-pt-modal">`
      + `<header class="umt-pt-head"><div>${heading}</div>`
      + `<div class="umt-pt-progress" title="${model.owned} of ${model.total} talents collected"><span style="width:${percent}%"></span></div>`
      + `<span class="umt-pt-count">${model.owned}<small>/${model.total}</small></span>`
      + `<button type="button" class="umt-pt-close" data-umt-pt-close aria-label="Close progression">×</button></header>`
      + `<div class="umt-pt-body">`
      + `<div class="umt-pt-canvas-wrap">${legendMarkup()}<div class="umt-pt-canvas umt-pz-board" data-umt-pt-canvas>${renderBoard(model, view)}</div>`
      + `</div>`
      + `<aside class="umt-pt-side">`
      + (reveal ? revealMarkup(model, reveal) : detailMarkup(model, selected))
      + `<h3 class="umt-pt-side-title">Run stats</h3>`
      // During a reveal the changes are listed once, under "What changed";
      // the full stats below stay plain rather than repeating them.
      + statsMarkup(stats, null)
      + timelineMarkup(model, game)
      + `</aside></div>`
      + (reveal ? `<footer class="umt-pt-foot"><button type="button" class="umt-pt-continue" data-umt-pt-close>Continue</button></footer>` : "")
      // On a phone the details open as a sheet over the board instead of
      // somewhere below it (hidden on wider screens, where the side panel has them).
      + (!reveal && selected
        ? `<div class="umt-pz-sheet" role="dialog" aria-label="${esc(selected.title)}">`
          + `<button type="button" class="umt-pz-sheet-close" data-umt-pz-deselect aria-label="Close details">×</button>`
          + detailMarkup(model, selected) + `</div>`
        : "")
      + `</section></div>`;
  }

  function renderOverlay() {
    const el = host();
    if (!el) return;
    let layer = el.querySelector(":scope > .umt-pt-layer");
    if (!view.open) {
      if (layer) layer.remove();
      return;
    }
    const canvasScroll = layer && layer.querySelector("[data-umt-pt-canvas]");
    const keep = canvasScroll ? { left: canvasScroll.scrollLeft, top: canvasScroll.scrollTop } : null;
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "umt-pt-layer";
      el.appendChild(layer);
    }
    // The game re-renders around a pick, and every re-render used to
    // rebuild the whole panel -- replaying its entrance (fade, rise, the new
    // piece dropping in) and reading as the board stuttering and starting over.
    // Skip a redraw that would change nothing, and when something did
    // change, redraw without replaying the entrance.
    const markup = overlayMarkup(view.game);
    if (layer.umtMarkup === markup && layer.umtOpenId === view.openId) return;
    const settled = layer.umtOpenId === view.openId && Boolean(layer.umtMarkup);
    layer.innerHTML = markup;
    layer.umtMarkup = markup;
    layer.umtOpenId = view.openId;
    layer.classList.toggle("is-settled", settled);
    const canvas = layer.querySelector("[data-umt-pt-canvas]");
    if (canvas && keep) {
      canvas.scrollLeft = keep.left;
      canvas.scrollTop = keep.top;
    }
  }

  // Brings the piece just picked up into view inside the board.
  function focusPiece(nodeId) {
    const layer = host() && host().querySelector(".umt-pt-layer");
    const canvas = layer && layer.querySelector("[data-umt-pt-canvas]");
    const piece = nodeId && canvas && canvas.querySelector(`[data-umt-node="${CSS.escape(nodeId)}"]`);
    if (!piece || canvas.scrollHeight <= canvas.clientHeight + 2) return;
    const box = piece.getBoundingClientRect();
    const frame = canvas.getBoundingClientRect();
    canvas.scrollTop = Math.max(0, canvas.scrollTop + (box.top + box.height / 2 - frame.top) - canvas.clientHeight / 2);
  }

  function openTree(game, options = {}) {
    if (!game || !game.state) return;
    view.game = game;
    view.open = true;
    view.mode = options.reveal ? "reveal" : "browse";
    view.reveal = options.reveal || null;
    view.freshIds = options.freshIds || new Set();
    view.selectedId = options.selectedId || null;
    view.lastFocus = document.activeElement;
    view.openId = (view.openId || 0) + 1;
    const focusId = options.selectedId || (view.freshIds.size ? [...view.freshIds][0] : null);
    renderOverlay();
    requestAnimationFrame(() => {
      focusPiece(focusId);
      const closeBtn = host() && host().querySelector(options.reveal ? ".umt-pt-continue" : ".umt-pt-close");
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    });
  }

  function closeTree() {
    if (!view.open) return;
    view.open = false;
    view.reveal = null;
    view.freshIds = new Set();
    renderOverlay();
    if (view.lastFocus && typeof view.lastFocus.focus === "function" && document.contains(view.lastFocus)) {
      view.lastFocus.focus({ preventScroll: true });
    }
  }

  function selectNode(id) {
    view.selectedId = id;
    if (view.mode === "reveal") {
      // Tapping around after a reveal turns it into ordinary browsing.
      view.mode = "browse";
      view.reveal = null;
      view.freshIds = new Set();
    }
    renderOverlay();
  }

  // ---------------------------------------------------------------------
  // Pick detection -> reveal
  // ---------------------------------------------------------------------

  const watch = { runId: null, ledgerLength: 0, stats: null, comboOwned: new Set(), pending: null };

  function ownedComboIds(game) {
    const model = buildModel(game);
    return new Set(model.combos.filter((c) => c.level > 0).map((c) => c.id));
  }

  // Two stat diffs in a row as one: earliest "from", latest "to".
  function mergeDiffs(first, second) {
    const merged = new Map((first || []).map((change) => [change.def.key, { ...change }]));
    (second || []).forEach((change) => {
      const existing = merged.get(change.def.key);
      if (existing) existing.to = change.to;
      else merged.set(change.def.key, { ...change });
    });
    return [...merged.values()].filter((change) => change.to !== change.from);
  }

  function checkForPicks(game) {
    const state = game && game.state;
    if (!state) return;
    const runId = state.runId || "run";
    const entries = ledger(game);
    if (watch.runId !== runId || entries.length < watch.ledgerLength) {
      // A different run (new, or loaded) -- whatever it already owns is not
      // news. Start watching from here.
      watch.runId = runId;
      watch.ledgerLength = entries.length;
      watch.stats = readStats(game);
      watch.comboOwned = ownedComboIds(game);
      return;
    }
    if (entries.length === watch.ledgerLength) {
      watch.stats = readStats(game);
      return;
    }
    // A boss reward lands while its cash-out is still counting up; hold the
    // reveal (the ledger stays unread) until Collect, instead of opening it
    // on top of the cash-out.
    if (payoutShowing(game)) return;
    const fresh = entries.slice(watch.ledgerLength);
    const after = readStats(game);
    const diff = statDiff(watch.stats, after);
    const combosNow = ownedComboIds(game);
    const newComboIds = new Set([...combosNow].filter((id) => !watch.comboOwned.has(id)));
    watch.ledgerLength = entries.length;
    watch.stats = after;
    watch.comboOwned = combosNow;

    const tree = window.CuddleSkillTree;
    const freshIds = new Set(fresh.map((e) => {
      const cat = resolveCatalogueNode(tree, e.id, e.title);
      return cat ? cat.id : e.id;
    }));
    newComboIds.forEach((id) => freshIds.add(id));

    // The bottom toast used to announce a boss or starting-bonus reward;
    // the reveal does that now, so retire it rather than show both. The
    // same goes for a combo the reveal is about to animate.
    if (state.bossRewardNotice) {
      state.bossRewardNotice = null;
      saveGame(game);
      document.querySelectorAll("#cuddleRoot .cuddle-v3-toast.is-boss").forEach((el) => el.remove());
    }
    if (newComboIds.size && state.synergyNotice) {
      state.synergyNotice = null;
      saveGame(game);
      document.querySelectorAll("#cuddleRoot .cuddle-v3-toast.is-synergy").forEach((el) => el.remove());
    }

    // Let the pick's own screen change settle first (a pick usually moves
    // the run straight on to the map).
    clearTimeout(watch.pending);
    watch.pending = setTimeout(() => {
      // One pick can land in the ledger more than once, a moment apart (a
      // reward applied twice). Fold that into the reveal already showing,
      // rather than opening it again -- which replayed its entrance.
      if (view.open && view.mode === "reveal" && view.reveal) {
        view.reveal.entries = view.reveal.entries.concat(fresh);
        view.reveal.diff = mergeDiffs(view.reveal.diff, diff);
        newComboIds.forEach((id) => view.reveal.newComboIds.add(id));
        freshIds.forEach((id) => view.freshIds.add(id));
        renderOverlay();
        return;
      }
      openTree(game, { reveal: { entries: fresh, diff, newComboIds }, freshIds });
    }, 260);
  }

  // Some reward layers apply a pick without writing it to the acquisition
  // ledger (the rebalance-v5 engines like Rainy Day, Wild Card). The tree
  // lights from that ledger, so record any successful chooseUpgrade that
  // left no trace. This file loads last, so this wraps the full chain.
  //
  // Other layers install on their own timers and some wrap chooseUpgrade
  // AFTER this runs, answering their own rewards without ever calling
  // through -- so this checks it is still the outermost wrapper, and wraps
  // again when it isn't (see the interval in install()).
  function installLedgerBackstop() {
    const Game = window.CuddleEngine && window.CuddleEngine.CuddleGame;
    if (!Game || !Game.prototype) return;
    const original = Game.prototype.chooseUpgrade;
    if (typeof original !== "function" || original.__umtProgressLedger) return;
    const wrapped = function chooseUpgradeWithLedger(choiceKey) {
      const state = this.state || {};
      const choices = Array.isArray(state.upgradeChoices) ? state.upgradeChoices : [];
      const choice = choices.find((item) => item && item.key === choiceKey) || null;
      const before = ledger(this).length;
      const result = original.apply(this, arguments);
      if (result && result.ok && choice && Array.isArray(this.state.rewardBookHistory)
          && this.state.rewardBookHistory.length === before) {
        this.state.rewardBookHistory.push({
          id: choice.id || "reward",
          icon: choice.icon || "✨",
          title: choice.title || "Reward",
          description: choice.description || "",
          kind: "round",
          round: num(this.state.round, 1)
        });
        saveGame(this);
      }
      return result;
    };
    Object.defineProperty(wrapped, "__umtProgressLedger", { value: true });
    Game.prototype.chooseUpgrade = wrapped;
  }

  // ---------------------------------------------------------------------
  // Stage-intro banner
  // ---------------------------------------------------------------------

  const banner = { timer: null, remaining: 0, startedAt: 0, el: null, moneyBaseline: null, runId: null };

  function roundToken(state) {
    return [state.runId || "run", state.roundIndex ?? state.round ?? "round", state.secret || ""].join(":");
  }

  function stageKey(state) {
    return `${roundToken(state)}:${state.boss ? state.boss.gate || state.boss.id || "boss" : "stage"}`;
  }

  function burdenTitle(id) {
    const info = window.CuddleRebalanceV5 && typeof window.CuddleRebalanceV5.burdenInfo === "function"
      ? window.CuddleRebalanceV5.burdenInfo(id) : null;
    return info ? info[0] : String(id || "Burden").replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  const VARIANTS = {
    jackpot: { icon: "💰", text: "Jackpot Run — greens pay double", kind: "bonus" },
    luckyStart: { icon: "🍀", text: "Lucky Start — one position is already yours", kind: "bonus" },
    doubleOrNothing: { icon: "⚖️", text: "Double or Nothing — solve by guess 3 to double the stage", kind: "hazard" },
    randomOpener: { icon: "🎲", text: "Head Start — a random word plays your first guess", kind: "info" }
  };

  function bannerContent(game, burdenNotice) {
    const state = game.state;
    const branch = window.CuddleBranchMap;
    const node = branch && typeof branch.currentStageNode === "function" ? branch.currentStageNode(game) : null;
    const gatesDone = Array.isArray(state.bossGatesDone) ? state.bossGatesDone.length : 0;
    const world = Math.min(3, gatesDone + 1);
    const boss = state.boss && !state.boss.__umtSynthetic ? state.boss : null;
    const lines = [];
    const token = roundToken(state);

    const content = {
      eyebrow: boss ? `World ${world} · Boss` : `World ${world} · Stage ${Math.max(1, num(state.round, 1))}`,
      icon: boss ? (boss.icon || "💀") : (node && node.typeIcon) || "🟩",
      title: boss ? (boss.title || "Boss") : (node && node.typeTitle) || "Wordle",
      tone: boss ? "boss" : node && node.type === "challenge" ? "challenge" : "plain",
      lines,
      points: [],
      money: [],
      onWin: null
    };

    if (boss) {
      if (boss.description) lines.push({ kind: "hazard", icon: "⚠️", text: boss.description });
      const tree = window.CuddleSkillTree;
      const reward = boss.rewardId && tree ? resolveCatalogueNode(tree, boss.rewardId) : null;
      if (reward) lines.push({ kind: "bonus", icon: reward.icon || "🎁", text: `Clear it to earn ${reward.title}` });
    }

    // A strict stage is lost outright if it isn't solved in time -- the
    // most important thing the banner can say about it.
    if (!boss && typeof game._hardGuessLimit === "function" && Number.isFinite(game._hardGuessLimit())) {
      lines.push({ kind: "hazard", icon: "⏱️", text: `Solve within ${game._hardGuessLimit()} guesses or the run is lost` });
    }

    const custom = state.cuddleRebalanceV5 || {};
    const variant = custom.activeVariant && custom.activeVariant.roundToken === token ? custom.activeVariant : null;
    if (variant && VARIANTS[variant.kind]) lines.push(VARIANTS[variant.kind]);

    const mandatory = custom.activeChallenge && custom.activeChallenge.roundToken === token ? custom.activeChallenge : null;
    const mode = state.cuddleMoneyMode || {};
    const thisStage = (item) => item && (item.offeredRound == null || num(item.offeredRound) === num(state.round));
    const mini = (thisStage(mode.activeChallenge) && mode.activeChallenge)
      || (thisStage(mode.challengeOffer) && mode.challengeOffer) || null;
    const challenge = mandatory || mini;
    if (challenge) {
      const description = typeof challenge.description === "string" ? challenge.description : "";
      lines.push({ kind: "hazard", icon: challenge.icon || "⚡", text: `${challenge.title || "Challenge"}${description ? ` — ${description}` : ""}` });
      const reward = num(challenge.reward);
      if (reward > 0) {
        // Challenges pay both currencies on a win.
        content.onWin = { points: mandatory ? reward : 0, money: reward, label: mandatory ? "Challenge cleared" : (mode.challengeOffer && !mode.activeChallenge ? "If you accept and win" : "Challenge cleared") };
      }
    }

    // Stacked disadvantages from bosses you walked past, on the guesses the
    // engine really puts them this stage.
    const engine = window.CuddleEngine;
    let newBurdenShown = false;
    if (engine && typeof engine.ratchetForGuess === "function") {
      const rows = Math.max(1, num(state.maxGuesses, 6));
      for (let guess = 1; guess <= rows; guess += 1) {
        let debuff = null;
        try {
          debuff = engine.ratchetForGuess(game, guess);
        } catch (_error) {
          debuff = null;
        }
        if (!debuff) continue;
        const title = burdenTitle(debuff.bossId || debuff.id);
        const isNew = Boolean(burdenNotice && burdenNotice.title && !newBurdenShown && burdenNotice.title === title);
        if (isNew) newBurdenShown = true;
        lines.push({ kind: "hazard", icon: "☠️", text: `Guess ${guess} · ${title}${isNew ? " (new)" : ""}` });
      }
    }

    // A freshly left-behind boss used to announce itself in the bottom
    // toast; it belongs to this stage's briefing now (taken off the state
    // by checkForStageStart the moment the stage began).
    if (burdenNotice && !newBurdenShown) {
      lines.push({ kind: "hazard", icon: "☠️", text: `New curse: ${burdenNotice.title || "beaten boss"}` });
    }

    const opening = num(state.roundOpeningPoints);
    if (opening > 0) content.points.push({ amount: opening, label: "Opening Verse" });
    if (banner.moneyBaseline && banner.moneyBaseline.runId === (state.runId || "run")) {
      const gained = Math.round(num(state.cuddleMoney) - banner.moneyBaseline.money);
      if (gained > 0) content.money.push({ amount: gained, label: "On arrival" });
    }

    if (!lines.length && !content.points.length && !content.money.length && !content.onWin) {
      lines.push({ kind: "info", icon: "✦", text: (node && node.typeDescription) || "Solve the Wordle to move on." });
    }
    return content;
  }

  function rewardRows(content) {
    const rows = [];
    content.points.forEach((p) => rows.push(
      `<div class="umt-reward-row is-points"><b>+${p.amount}</b><small>pts</small><em>${esc(p.label)}</em></div>`
    ));
    content.money.forEach((m) => rows.push(
      `<div class="umt-reward-row is-money"><b>+$${m.amount}</b><em>${esc(m.label)}</em></div>`
    ));
    const gained = rows.length ? `<div class="umt-sb-rewards">${rows.join("")}</div>` : "";
    const win = content.onWin
      ? `<div class="umt-sb-win"><span>${esc(content.onWin.label)}</span>`
        + (content.onWin.points ? `<span class="umt-reward-chip is-points">+${content.onWin.points} pts</span>` : "")
        + (content.onWin.money ? `<span class="umt-reward-chip is-money">+$${content.onWin.money}</span>` : "")
        + `</div>`
      : "";
    return gained + win;
  }

  // Money gold, points green -- the same colours as the header counters.
  function rewardText(text) {
    return esc(text)
      .replace(/[+-]?\$\s?\d[\d,]*/g, (match) => `<b class="umt-money">${match}</b>`)
      .replace(/[+-]?\d[\d,]*\s?(?:points|point|pts)\b/g, (match) => `<b class="umt-points">${match}</b>`);
  }

  function bannerMarkup(content, holdMs) {
    const lines = content.lines.map((line) => (
      `<li class="is-${line.kind}"><span aria-hidden="true">${esc(line.icon)}</span><span>${rewardText(line.text)}</span></li>`
    )).join("");
    return `<div class="umt-stage-banner is-${content.tone}" role="status" aria-live="polite" style="--hold:${holdMs}ms">`
      + `<div class="umt-sb-sheen" aria-hidden="true"></div>`
      + `<div class="umt-sb-head"><span class="umt-sb-icon" aria-hidden="true">${esc(content.icon)}</span>`
      + `<div><span class="umt-sb-eyebrow">${esc(content.eyebrow)}</span><strong class="umt-sb-title">${esc(content.title)}</strong></div></div>`
      + (lines ? `<ul class="umt-sb-lines">${lines}</ul>` : "")
      + rewardRows(content)
      + `<span class="umt-sb-timer" aria-hidden="true"></span>`
      + `</div>`;
  }

  function dismissBanner(immediate) {
    clearTimeout(banner.timer);
    banner.timer = null;
    const el = banner.el;
    banner.el = null;
    if (!el) return;
    if (immediate || reducedMotion()) {
      el.remove();
      return;
    }
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 420);
  }

  function showBanner(game, burdenNotice) {
    const el = host();
    if (!el) return;
    dismissBanner(true);
    const content = bannerContent(game, burdenNotice);
    const lineCount = content.lines.length + content.points.length + content.money.length + (content.onWin ? 1 : 0);
    const holdMs = Math.min(6200, 2800 + lineCount * 550);
    const wrap = document.createElement("div");
    wrap.className = "umt-stage-banner-wrap";
    wrap.innerHTML = bannerMarkup(content, holdMs);
    el.appendChild(wrap);
    banner.el = wrap;
    const card = wrap.firstElementChild;
    banner.remaining = holdMs;
    banner.startedAt = Date.now();
    banner.timer = setTimeout(() => dismissBanner(false), holdMs);
    card.addEventListener("click", () => dismissBanner(false));
    card.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse" || !banner.timer) return;
      clearTimeout(banner.timer);
      banner.timer = null;
      banner.remaining = Math.max(600, banner.remaining - (Date.now() - banner.startedAt));
      card.classList.add("is-paused");
    });
    card.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse" || banner.el !== wrap || banner.timer) return;
      banner.startedAt = Date.now();
      banner.timer = setTimeout(() => dismissBanner(false), banner.remaining);
      card.classList.remove("is-paused");
    });
  }

  function checkForStageStart(game) {
    const state = game && game.state;
    if (!state) return;
    const runId = state.runId || "run";
    if (state.status !== "playing") {
      // Anything gained between here and the next stage's first render
      // arrived "on arrival".
      banner.moneyBaseline = { runId, money: num(state.cuddleMoney) };
      if (banner.el && state.status !== "playing") dismissBanner(true);
      return;
    }
    if (state.roundIntroPending || num(state.guessesUsed) > 0 || (state.history || []).length) return;
    const key = stageKey(state);
    if (state.umtStageBannerKey === key) return;
    state.umtStageBannerKey = key;
    // Taken now, synchronously, so the old bottom toast never paints.
    const burdenNotice = state.burdenNotice || null;
    if (burdenNotice) {
      state.burdenNotice = null;
      document.querySelectorAll("#cuddleRoot .cuddle-v3-toast.is-burden").forEach((el) => el.remove());
    }
    // Let every layer finish its own round-start work (variants, challenge
    // offers, interest) before reading what the stage holds.
    banner.pending = true;
    setTimeout(() => {
      if (!game.state || game.state.status !== "playing" || game.state.umtStageBannerKey !== key) {
        banner.pending = false;
        return;
      }
      saveGame(game);
      // A boss makes an entrance first (cuddle-worlds.js); the briefing
      // banner follows once it clears.
      const boss = game.state.boss && !game.state.boss.__umtSynthetic ? game.state.boss : null;
      const worlds = window.CuddleWorlds;
      if (boss && worlds && typeof worlds.playBossEntrance === "function") {
        worlds.playBossEntrance({
          game,
          boss,
          onDone: () => {
            banner.pending = false;
            if (!game.state || game.state.status !== "playing" || game.state.umtStageBannerKey !== key) return;
            showBanner(game, burdenNotice);
          }
        });
        return;
      }
      banner.pending = false;
      showBanner(game, burdenNotice);
    }, 140);
  }

  // ---------------------------------------------------------------------
  // Quest banner: when a quest turns up mid-stage, a short "Quest incoming"
  // banner swooshes in over the board and out again, so it can't be missed.
  // It waits for the stage banner and any boss entrance to clear first.
  // ---------------------------------------------------------------------

  const questBanner = { el: null, timer: null, wait: null };

  function questKey(state, quest) {
    return `${stageKey(state)}|${num(state.guessesUsed)}|${quest.id}|${quest.description}`;
  }

  function dismissQuestBanner(immediate) {
    clearTimeout(questBanner.timer);
    questBanner.timer = null;
    const el = questBanner.el;
    questBanner.el = null;
    if (!el) return;
    if (immediate || reducedMotion()) {
      el.remove();
      return;
    }
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 460);
  }

  function showQuestBanner(quest) {
    const el = host();
    if (!el) return;
    dismissQuestBanner(true);
    const wrap = document.createElement("div");
    wrap.className = "umt-quest-banner-wrap";
    wrap.innerHTML = `<div class="umt-quest-banner" role="status" aria-live="polite">`
      + `<span class="umt-qb-icon" aria-hidden="true">${esc(quest.icon || "✦")}</span>`
      + `<div class="umt-qb-text"><span class="umt-qb-eyebrow">Quest incoming</span>`
      + `<strong>${esc(quest.title || "Quest")}</strong>`
      + `<span class="umt-qb-desc">${esc(quest.description || "")}</span>`
      + `<span class="umt-qb-foot">Do it on your next guess for a reward.</span></div>`
      + `</div>`;
    el.appendChild(wrap);
    questBanner.el = wrap;
    wrap.firstElementChild.addEventListener("click", () => dismissQuestBanner(false));
    questBanner.timer = setTimeout(() => dismissQuestBanner(false), 2600);
  }

  function checkForQuest(game) {
    const state = game && game.state;
    if (!state || state.status !== "playing" || !state.activeQuest || state.roundIntroPending) {
      if (questBanner.el && (!state || state.status !== "playing")) dismissQuestBanner(true);
      return;
    }
    const quest = state.activeQuest;
    const key = questKey(state, quest);
    if (state.umtQuestBannerKey === key) return;
    // Let the stage banner and a boss entrance finish first.
    if (banner.el || banner.pending || document.querySelector(".umt-boss-entrance")) {
      clearTimeout(questBanner.wait);
      questBanner.wait = setTimeout(() => checkForQuest(game), 400);
      return;
    }
    state.umtQuestBannerKey = key;
    showQuestBanner(quest);
  }

  // ---------------------------------------------------------------------
  // Entry points: map-header button, landing tree button, render hook
  // ---------------------------------------------------------------------

  function decorateMapHeader(root, game) {
    const slot = root.querySelector(".cuddle-branch-shell .cuddle-header-side-right");
    if (!slot || slot.querySelector(".umt-pt-open")) return;
    const model = buildModel(game);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "umt-pt-open";
    button.dataset.umtPtOpen = "1";
    button.setAttribute("aria-label", `Open progression tree, ${model.owned} of ${model.total} talents`);
    button.innerHTML = `<span aria-hidden="true">✦</span><span class="umt-pt-open-label">Progression</span><b>${model.owned}</b>`;
    slot.appendChild(button);
  }

  function payoutShowing(game) {
    const money = game && game.state && game.state.cuddleMoneyMode;
    return Boolean((money && money.pendingPayout && money.pendingPayout.id !== money.lastAnimatedPayoutId)
      || document.getElementById("cuddleMoneyPayoutOverlay")
      || (window.CuddleMoneyMode && typeof window.CuddleMoneyMode.payoutActive === "function"
        && window.CuddleMoneyMode.payoutActive()));
  }

  function syncPayoutHold(root, game) {
    // The cash-out only starts on the play screen (it needs the header).
    if (payoutShowing(game) && root.querySelector(".cuddle-header")) {
      view.payoutHold = true;
      view.payoutSeenAt = Date.now();
    }
    if (game.state.status === "playing" || game.state.status === "branchMap") view.payoutHold = false;
    root.classList.toggle("umt-payout-pending", Boolean(view.payoutHold));
    if (!view.payoutHold) return;
    // Never leave the reward screen hidden if the cash-out doesn't appear.
    clearTimeout(view.payoutCheck);
    view.payoutCheck = setTimeout(() => {
      if (!view.payoutHold || payoutShowing(game) || Date.now() - view.payoutSeenAt < 1500) return;
      view.payoutHold = false;
      root.classList.remove("umt-payout-pending");
    }, 1600);
  }

  function afterRender(root, game, landing) {
    if (!root) return;
    view.game = game || view.game;
    if (window.CuddleWorlds && typeof window.CuddleWorlds.applyTheme === "function") {
      window.CuddleWorlds.applyTheme(root, landing ? null : game);
    }
    if (landing || !game || !game.state) {
      dismissBanner(true);
      dismissQuestBanner(true);
      return;
    }
    // A solve renders the reward screen at once, but the cash-out is added a
    // frame or two later and fades in. Keep the reward screen hidden until
    // the cash-out has been collected so it doesn't flash first.
    // (A render can briefly wipe and replay the cash-out, so the hold lasts
    // until Collect is pressed, not just while the overlay is on screen.)
    syncPayoutHold(root, game);
    // A new run renders the map first and adds the Starting Bonus overlay
    // a frame or two later, so the map flashed before the choice appeared.
    // Keep the map hidden until the bonus has been chosen.
    const money = game.state.cuddleMoneyMode;
    root.classList.toggle("umt-starter-pending", Boolean(money && money.starterRewardPending
      && Array.isArray(money.starterRewardChoices) && money.starterRewardChoices.length));
    decorateMapHeader(root, game);
    checkForPicks(game);
    checkForStageStart(game);
    checkForQuest(game);
    if (view.open) renderOverlay();
  }

  function installRenderHook() {
    const campaign = window.CuddleCampaign;
    if (!campaign || campaign.__umtProgression) return false;
    const previous = campaign.afterRender;
    window.CuddleCampaign = Object.freeze(Object.assign({}, campaign, {
      __umtProgression: true,
      afterRender(root, game, landing) {
        if (typeof previous === "function") previous.call(this, root, game, landing);
        try {
          afterRender(root, game, landing);
        } catch (error) {
          console.warn("Cuddle progression: render hook failed.", error);
        }
      }
    }));
    return true;
  }

  function activeGame() {
    return view.game
      || (window.CuddleRebalanceV5 && typeof window.CuddleRebalanceV5.getActiveGame === "function" && window.CuddleRebalanceV5.getActiveGame())
      || (window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function" && window.CuddleBranchMap.getActiveGame())
      || null;
  }

  function installEvents() {
    // Window capture runs before the cash-out's own document-level handler,
    // so the hold is released before the render it triggers.
    window.addEventListener("click", (event) => {
      if (event.target && event.target.closest && event.target.closest("[data-cuddle-money-action='collect-payout']")) {
        view.payoutHold = false;
      }
    }, true);
    // Capture phase so the old flat skill-tree screen never opens: its
    // button (on the landing page) now opens this tree instead.
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      // The landing page's 🌳 button (data-action="skill-tree") opens this
      // tree too. With no run to show, it's left to open the old catalogue.
      const legacy = target.closest('[data-action="skill-tree"], [data-action="open-skill-tree"], [data-umt-pt-open]');
      if (legacy) {
        const game = activeGame();
        if (game && game.state) {
          event.preventDefault();
          event.stopPropagation();
          openTree(game);
        }
        return;
      }
      if (!view.open) return;
      if (target.closest("[data-umt-pt-close]")) {
        event.preventDefault();
        closeTree();
        return;
      }
      if (target.closest(".umt-pt-layer [data-umt-pz-deselect]")) {
        event.preventDefault();
        selectNode(null);
        return;
      }
      const node = target.closest(".umt-pt-layer [data-umt-node]");
      if (node) {
        event.preventDefault();
        selectNode(node.dataset.umtNode);
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (!view.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeTree();
        return;
      }
      const node = event.target instanceof Element && event.target.closest(".umt-pt-layer [data-umt-node]");
      if (node && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.stopPropagation();
        selectNode(node.dataset.umtNode);
        return;
      }
      // Keep typing inside the tree from reaching the word-building keys.
      if (event.target instanceof Element && event.target.closest(".umt-pt-layer")) event.stopPropagation();
    }, true);
  }

  let attempts = 0;
  function install() {
    attempts += 1;
    const ready = window.CuddleEngine && window.CuddleEngine.CuddleGame && window.CuddleCampaign && window.CuddleSkillTree;
    if (!ready) {
      if (attempts < 200) setTimeout(install, 50);
      return;
    }
    installLedgerBackstop();
    if (!installRenderHook() && attempts < 200 && !(window.CuddleCampaign && window.CuddleCampaign.__umtProgression)) {
      setTimeout(install, 50);
      return;
    }
    // Other add-ons replace CuddleCampaign and wrap chooseUpgrade on their
    // own install timers; if one lands after this, hook the new one too.
    setInterval(() => {
      installRenderHook();
      installLedgerBackstop();
    }, 1000);
  }

  installEvents();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  window.CuddleProgression = Object.freeze({
    openTree: (game) => openTree(game || activeGame()),
    closeTree,
    buildModel,
    readStats
  });
})();
