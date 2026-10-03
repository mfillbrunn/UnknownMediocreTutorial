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
//   2. The rune map. Every upgrade the run can collect is a rune in one
//      cluster per theme (Scoring, Economy, Insight...) plus the boss
//      relics, ringed round the theme's sigil and tied to it by a string.
//      Related runes share a dotted string; a combo's two runes share a
//      rose one, with the bonus as a knot halfway along. What you own
//      lights up. Drag, pinch or scroll to move around. Whenever you pick
//      something up the map opens on its own, flies in to the new rune and
//      ignites it -- and if that completed a combo, draws the combo's
//      string and shows its bonus.
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
  // Tree model
  // ---------------------------------------------------------------------

  // The six branches the radial tree fans into. These are themes, not the
  // catalogue's own grouping by where a reward comes from: "Round Rewards"
  // alone holds twenty-odd upgrades, far too many for one branch to read.
  // Anything not listed falls into a branch by its catalogue category.
  const WEDGES = [
    { id: "scoring", title: "Scoring", color: "#8ff7cd", angle: -150,
      ids: ["storybookStart", "earlySolveBoost", "mulliganValueBoost", "colourTrade", "greyscale"] },
    { id: "economy", title: "Economy", color: "#f6c956", angle: -90,
      ids: ["rainyDay", "encore", "vowelBounty", "doubleDown", "treasureMap", "mulliganTiles", "jokerTiles", "oracleTiles"] },
    { id: "solving", title: "Solving Aids", color: "#7cb8ff", angle: -30,
      ids: ["consonantSweep", "alphabet-compass"] },
    { id: "coach", title: "Cuddle Coach", color: "#ff9ec7", angle: 30,
      ids: ["coachPossibleAnswers", "coachMeterThreshold", "coachMeterReward"] },
    { id: "quests", title: "Quests", color: "#f6a94a", angle: 90,
      ids: ["questPoints", "questRefreshes", "questReroll", "surprise-assignment"] },
    { id: "hand", title: "Hand & Tools", color: "#d5a6ff", angle: 150,
      ids: ["extraMulligans", "mulliganSize", "handSizeBoost", "jokerCache", "jokerCacheLarge", "wideChoice", "rewardEcho", "cullOne", "cullTwo", "greenCount", "categorySense"] },
    { id: "insight", title: "Insight", color: "#9ee86f", angle: 180,
      ids: ["vowelLamp", "echoFinder", "patternLens", "yellowHint", "lastLight", "treasureHunter", "mistakeShield"] }
  ];
  // The rune clusters, in their order around the map: themes alternate
  // big and small so the ring stays even. Boss relics are their own cluster.
  const CLUSTER_STYLE = {
    scoring: { icon: "star", tagline: "Make every tile count." },
    hand: { icon: "toolbox", tagline: "Better cards, better tools." },
    quests: { icon: "clipboard", tagline: "Side goals, real rewards." },
    economy: { icon: "moneyBag", tagline: "Coins in, coins out." },
    coach: { icon: "pinkHeart", tagline: "Your coach in the corner." },
    insight: { icon: "eye", tagline: "See more. Guess smarter." },
    solving: { icon: "bulb", tagline: "Gentle nudges for tough words." },
    bosses: { icon: "trophy", tagline: "Taken from the bosses you beat." }
  };
  const CLUSTER_ORDER = ["scoring", "hand", "quests", "economy", "coach", "insight", "solving", "bosses"];
  const CATEGORY_WEDGE = { economy: "economy", solving: "solving", quests: "quests", easierStages: "hand", insight: "insight" };
  const COMBO_COLOR = "#ff7ab8";
  const BOSS_COLOR = "#fb7185";
  const CLUSTERS = CLUSTER_ORDER.map((id) => {
    const wedge = WEDGES.find((w) => w.id === id);
    return wedge
      ? { id, title: wedge.title, color: wedge.color, ids: wedge.ids, ...CLUSTER_STYLE[id] }
      : { id, title: "Boss Relics", color: BOSS_COLOR, ids: [], ...CLUSTER_STYLE[id] };
  });
  // Bronze / silver / gold, as on the reward cards' rarity badges.
  const TIER_STROKE = { common: "#c98a4b", rare: "#c6d0de", epic: "#b98cff", legendary: "#f6c956" };
  const TIER_NAME = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
  // Boss rewards that also come up as between-round picks
  // (cuddle-economy-rarity-v8.js LEGENDARY_PICKS); pickTierName says which tier.
  const LEGENDARY_PICK_IDS = new Set(["doubleMulligans", "cullRare", "freeVowelSweep", "biggerMulligans", "questCadence", "revealGreen", "goldenThread", "questDoublePick",
    "questPersistReward", "secondCup", "allThemesBoss", "umtAllThemes"]);

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

  // Pairs of runes that belong together without being a combo: a string
  // ties them on the map. Combos draw their own (rose) string.
  const RELATED = [
    ["jokerCache", "jokerCacheLarge"],
    ["cullOne", "cullTwo"],
    ["cullTwo", "cullRare"],
    ["treasureMap", "mulliganTiles"],
    ["treasureMap", "jokerTiles"],
    ["treasureMap", "oracleTiles"],
    ["colourTrade", "greyscale"],
    ["extraMulligans", "doubleMulligans"],
    ["mulliganSize", "biggerMulligans"],
    ["questPoints", "questCadence"],
    ["questReroll", "questDoublePick"],
    ["coachMeterThreshold", "coachMeterReward"],
    ["vowelLamp", "freeVowelSweep"],
    ["categorySense", "allThemesBoss"],
    ["lastLight", "revealGreen"],
    ["alphabet-compass", "consonantSweep"],
    ["treasureHunter", "vowelBounty"],
    ["mistakeShield", "secondCup"]
  ];

  // Map geometry, in world units. Each cluster is a ring of runes around
  // its sigil. On a wide view the clusters sit on one big ring around the
  // run's core; on a tall one (a phone) they stack in two columns with the
  // core between them, so the overview fills the screen.
  const RUNE_SPACING = 116;
  const CLUSTER_GAP = 150;
  const GRID_ORDER = [["hand", "scoring"], ["bosses", "quests"], ["economy", "coach"], ["insight", "solving"]];

  function ringRadius(count) {
    return Math.max(128, (RUNE_SPACING * count) / (2 * Math.PI));
  }

  function placeRunes(cluster, outward) {
    const count = cluster.nodes.length;
    // The string in from the core arrives between two runes, not on one.
    const start = outward + Math.PI + Math.PI / Math.max(1, count);
    cluster.nodes.forEach((node, i) => {
      const a = start + (i * 2 * Math.PI) / Math.max(1, count);
      node.x = cluster.x + cluster.ring * Math.cos(a);
      node.y = cluster.y + cluster.ring * Math.sin(a);
    });
  }

  function layoutRing(clusters) {
    const arcs = clusters.map((cluster) => cluster.reach * 2 + CLUSTER_GAP);
    const radius = Math.max(380, arcs.reduce((sum, arc) => sum + arc, 0) / (2 * Math.PI));
    let cursor = -Math.PI / 2 - arcs[0] / radius / 2;
    clusters.forEach((cluster, index) => {
      const angle = cursor + arcs[index] / radius / 2;
      cursor += arcs[index] / radius;
      cluster.x = radius * Math.cos(angle);
      cluster.y = radius * Math.sin(angle);
      placeRunes(cluster, angle);
    });
  }

  function layoutColumns(clusters) {
    const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const rows = GRID_ORDER.map((ids) => ids.map((id) => byId.get(id)).filter(Boolean)).filter((row) => row.length);
    clusters.filter((cluster) => !GRID_ORDER.flat().includes(cluster.id)).forEach((cluster) => rows.push([cluster]));
    const heights = rows.map((row) => Math.max(...row.map((cluster) => cluster.reach)) * 2);
    const middle = Math.floor(rows.length / 2);
    const gaps = rows.map((_, i) => (i === middle ? 230 : 70));
    const total = heights.reduce((sum, h) => sum + h, 0) + gaps.slice(1).reduce((sum, g) => sum + g, 0);
    let y = -total / 2;
    let coreY = 0;
    rows.forEach((row, i) => {
      if (i > 0) {
        if (i === middle) coreY = y + gaps[i] / 2;
        y += gaps[i];
      }
      const cy = y + heights[i] / 2;
      row.forEach((cluster, side) => {
        const left = row.length === 1 ? 0 : side === 0 ? -1 : 1;
        cluster.x = left * (cluster.reach + 40);
        cluster.y = cy;
        placeRunes(cluster, Math.atan2(cy - 0, cluster.x || 0.001));
      });
      y += heights[i];
    });
    clusters.forEach((cluster) => { cluster.y -= coreY; cluster.nodes.forEach((node) => { node.y -= coreY; }); });
  }

  function layoutClusters(clusters, tall) {
    clusters.forEach((cluster) => {
      cluster.ring = ringRadius(cluster.nodes.length);
      cluster.reach = cluster.ring + 80;
    });
    if (tall) layoutColumns(clusters);
    else layoutRing(clusters);
  }

  // A gentle curve between two points, bowed away from (cx, cy).
  function curveBetween(a, b, bow, cx = 0, cy = 0) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
    const qx = mx + nx * len * bow;
    const qy = my + ny * len * bow;
    return {
      d: `M${r1(a.x)} ${r1(a.y)}Q${r1(qx)} ${r1(qy)} ${r1(b.x)} ${r1(b.y)}`,
      // The curve's own midpoint (t = 0.5), where a combo's knot sits.
      mid: { x: 0.25 * a.x + 0.5 * qx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * qy + 0.25 * b.y }
    };
  }

  function r1(value) {
    return Math.round(value * 10) / 10;
  }

  // Everything the tree draws, derived fresh each time: the catalogue plus
  // everything this run has actually picked up -- so a pick can never be
  // missing from the tree just because the catalogue didn't know about it.
  // aspect: the map view's width / height, which picks the layout.
  function buildModel(game, aspect = 1.2) {
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

    // Every rune goes into a cluster: one per theme, plus the boss relics.
    const clusters = CLUSTERS.map((def) => ({ ...def, nodes: [] }));
    const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    nodes.forEach((node) => {
      if (node.kind === "combo") return;
      let clusterId = "bosses";
      if (node.kind !== "boss") {
        const canon = canonicalId(node.id);
        const listed = WEDGES.find((w) => w.ids.includes(node.id) || w.ids.includes(canon));
        clusterId = listed ? listed.id : (CATEGORY_WEDGE[node.category] || (node.easyOnly ? "solving" : "hand"));
      }
      node.wedge = clusterId;
      clusterById.get(clusterId).nodes.push(node);
    });
    clusters.forEach((cluster) => {
      const ids = cluster.ids || [];
      const rank = (node) => {
        const at = ids.indexOf(node.id) >= 0 ? ids.indexOf(node.id) : ids.indexOf(canonicalId(node.id));
        return at < 0 ? 99 : at;
      };
      cluster.nodes.sort((a, b) => rank(a) - rank(b));
      cluster.owned = cluster.nodes.filter((n) => n.level > 0).length;
    });
    const placed = clusters.filter((cluster) => cluster.nodes.length);
    layoutClusters(placed, aspect < 0.85);

    // Combos are strings between their two halves, with the bonus as a
    // knot halfway along.
    const combos = [...nodes.values()].filter((n) => n.kind === "combo");
    combos.forEach((combo) => {
      const halves = (combo.reqNodes || []).filter((n) => Number.isFinite(n.x));
      if (halves.length < 2) return;
      const curve = curveBetween(halves[0], halves[1], 0.2);
      combo.path = curve.d;
      combo.x = curve.mid.x;
      combo.y = curve.mid.y;
      combo.halves = halves.slice(0, 2);
      combo.wedge = "combos";
    });
    const comboPairs = new Set(combos.filter((c) => c.halves).map((c) => c.halves.map((h) => h.id).sort().join("|")));
    const related = RELATED
      .map(([a, b]) => [nodes.get(a), nodes.get(b)])
      .filter(([a, b]) => a && b && Number.isFinite(a.x) && Number.isFinite(b.x)
        && !comboPairs.has([a.id, b.id].sort().join("|")))
      .map(([a, b]) => ({ a, b, d: curveBetween(a, b, 0.14).d }));
    const bosses = clusterById.get("bosses").nodes;
    const bounds = {
      minX: Math.min(-90, ...placed.map((c) => c.x - c.reach)) - 20,
      maxX: Math.max(90, ...placed.map((c) => c.x + c.reach)) + 20,
      minY: Math.min(-90, ...placed.map((c) => c.y - c.reach)) - 20,
      maxY: Math.max(90, ...placed.map((c) => c.y + c.reach)) + 20
    };

    const all = [...nodes.values()].filter((n) => Number.isFinite(n.x));
    // An Easy-only talent drops out of the count on other difficulties --
    // unless the run owns it anyway, which always counts.
    const countable = all.filter((n) => !(n.easyOnly && !easy) || n.level > 0);
    return {
      nodes,
      all,
      wedges: WEDGES,
      clusters: placed,
      combos: combos.filter((c) => c.halves),
      related,
      bounds,
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
  // Rune map: clusters of runes around their sigils, tied by strings
  // ---------------------------------------------------------------------

  function iconMarkup(icon, size) {
    const text = String(icon || "✦");
    const Icons = window.CuddleIcons;
    if (Icons && (Icons.hasEmoji(text) || /^[a-z][a-zA-Z]+$/.test(text))) return Icons.markup(text, size, 0, 0);
    return `<text class="umt-rn-glyph" y="${r1(size * 0.32)}" font-size="${size * 0.8}">${esc(text)}</text>`;
  }

  // A rune's name on one line, or split into two near the middle.
  function labelLines(title) {
    const text = String(title || "");
    if (text.length <= 13 || !text.includes(" ")) return [text];
    const words = text.split(" ");
    let best = [text];
    let bestGap = Infinity;
    for (let i = 1; i < words.length; i += 1) {
      const first = words.slice(0, i).join(" ");
      const second = words.slice(i).join(" ");
      const gap = Math.abs(first.length - second.length);
      if (gap < bestGap) { bestGap = gap; best = [first, second]; }
    }
    return best;
  }

  function runeState(node, model, fresh) {
    const owned = node.level > 0;
    const locked = node.easyOnly && !model.easy && !owned;
    return { owned, locked, cls: fresh.has(node.id) ? "is-fresh is-owned" : owned ? "is-owned" : locked ? "is-locked" : "is-open" };
  }

  function runeMarkup(node, model, view, fresh) {
    const { owned, locked, cls } = runeState(node, model, fresh);
    const tier = TIER_NAME[node.tier] || "";
    const status = owned ? `yours${node.level > 1 ? `, level ${node.level}` : ""}` : locked ? "Easy difficulty only" : "not yet";
    const pips = node.maxLevel && node.maxLevel > 1
      ? Array.from({ length: node.maxLevel }, (_, i) => {
        const x = (i - (node.maxLevel - 1) / 2) * 9;
        return `<circle class="umt-rn-pip${i < node.level ? " is-on" : ""}" cx="${r1(x)}" cy="31" r="2.8"/>`;
      }).join("")
      : "";
    const lines = labelLines(node.title);
    const label = lines.map((line, i) => `<tspan x="0" dy="${i ? 13 : 0}">${esc(line)}</tspan>`).join("");
    return `<g class="umt-rn-rune ${cls}${node.id === view.selectedId ? " is-selected" : ""}" data-umt-node="${esc(node.id)}"`
      + ` transform="translate(${r1(node.x)} ${r1(node.y)})" style="--c:${nodeColor(node)};--t:${TIER_STROKE[node.tier] || TIER_STROKE.common}"`
      + ` tabindex="0" role="button" aria-label="${esc(node.title)}${tier ? `, ${tier}` : ""}, ${status}">`
      + `<circle class="umt-rn-halo" r="36"/>`
      + `<circle class="umt-rn-ring" r="25"/>`
      + `<circle class="umt-rn-stone" r="21"/>`
      + `<circle class="umt-rn-ignite" r="25" pathLength="1"/>`
      + `<g class="umt-rn-icon">${locked ? iconMarkup("lock", 20) : iconMarkup(node.icon, 22)}</g>`
      + `<g class="umt-rn-burst" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="-30" x2="0" y2="-40" transform="rotate(${i * 45})"/>`).join("")}</g>`
      + pips
      + `<text class="umt-rn-label" y="${pips ? 50 : 44}">${label}</text>`
      + `</g>`;
  }

  function knotMarkup(combo, view, fresh) {
    const have = combo.halves.filter((h) => h.level > 0).length;
    const state = combo.level > 0 ? "is-active" : have ? "is-half" : "is-idle";
    return `<g class="umt-rn-knot ${state}${fresh.has(combo.id) ? " is-fresh" : ""}${combo.id === view.selectedId ? " is-selected" : ""}"`
      + ` data-umt-node="${esc(combo.id)}" transform="translate(${r1(combo.x)} ${r1(combo.y)})"`
      + ` tabindex="0" role="button" aria-label="Combo: ${esc(combo.title)}, ${combo.level > 0 ? "active" : `${have} of 2 halves owned`}">`
      + `<circle class="umt-rn-knot-flash" r="16"/>`
      + `<rect class="umt-rn-knot-shape" x="-11" y="-11" width="22" height="22" rx="4" transform="rotate(45)"/>`
      + `<g class="umt-rn-knot-icon">${iconMarkup(combo.icon, 13)}</g>`
      + `<text class="umt-rn-knot-label" y="30">${esc(combo.title)}</text>`
      + `</g>`;
  }

  function sigilMarkup(cluster) {
    return `<g class="umt-rn-sigil" data-umt-cluster="${esc(cluster.id)}" transform="translate(${r1(cluster.x)} ${r1(cluster.y)})"`
      + ` style="--c:${cluster.color}" role="button" tabindex="0" aria-label="${esc(cluster.title)}: ${cluster.owned} of ${cluster.nodes.length} runes lit. Zoom in.">`
      + `<circle class="umt-rn-sigil-glow" r="44"/>`
      + `<circle class="umt-rn-sigil-disc" r="31"/>`
      + `<g class="umt-rn-sigil-icon">${iconMarkup(cluster.icon, 28)}</g>`
      + `<text class="umt-rn-sigil-title" y="-42">${esc(cluster.title)}</text>`
      + `<text class="umt-rn-sigil-count" y="50">${cluster.owned} / ${cluster.nodes.length}</text>`
      + `</g>`;
  }

  function mapMarkup(model, view) {
    const fresh = view.freshIds || new Set();
    const clusters = model.clusters;
    const core = clusters.map((cluster) => `<path class="umt-rn-string is-trunk${cluster.owned ? " is-lit" : ""}" style="--c:${cluster.color}"`
      + ` d="M0 0L${r1(cluster.x)} ${r1(cluster.y)}"/>`).join("");
    const spokes = clusters.map((cluster) => cluster.nodes.map((node) => {
      const lit = node.level > 0;
      return `<path class="umt-rn-string is-spoke${lit ? " is-lit" : ""}${fresh.has(node.id) ? " is-fresh" : ""}" style="--c:${cluster.color}"`
        + ` pathLength="1" d="M${r1(cluster.x)} ${r1(cluster.y)}L${r1(node.x)} ${r1(node.y)}"/>`;
    }).join("")).join("");
    const related = model.related.map(({ a, b, d }) => {
      const lit = a.level > 0 && b.level > 0;
      return `<path class="umt-rn-string is-related${lit ? " is-lit" : ""}" d="${d}"/>`;
    }).join("");
    const combos = model.combos.map((combo) => {
      const have = combo.halves.filter((h) => h.level > 0).length;
      const state = combo.level > 0 ? "is-active" : have ? "is-half" : "is-idle";
      return `<path class="umt-rn-string is-combo ${state}${fresh.has(combo.id) ? " is-fresh" : ""}" pathLength="1" d="${combo.path}"/>`;
    }).join("");
    const titles = clusters.map((cluster) => `<text class="umt-rn-far-title" style="--c:${cluster.color}" x="${r1(cluster.x)}" y="${r1(cluster.y + 14)}">${esc(cluster.title)}</text>`).join("");
    const b = model.bounds;
    return `<div class="umt-rn-map" data-umt-rn-map>`
      + `<svg class="umt-rn-svg" data-lod="far" role="group" aria-label="Talent runes. Drag to move, pinch or scroll to zoom."`
      + ` data-bounds="${r1(b.minX)} ${r1(b.minY)} ${r1(b.maxX)} ${r1(b.maxY)}">`
      + `<g class="umt-rn-world" data-umt-rn-world>`
      + `<g class="umt-rn-strings">${core}${spokes}${related}${combos}</g>`
      + `<g class="umt-rn-core"><circle class="umt-rn-core-glow" r="78"/><circle class="umt-rn-core-disc" r="52"/>`
      + `<text class="umt-rn-core-count" y="6">${model.owned}<tspan class="umt-rn-core-total"> / ${model.total}</tspan></text>`
      + `<text class="umt-rn-core-caption" y="26">runes lit</text></g>`
      + `<g class="umt-rn-sigils">${clusters.map(sigilMarkup).join("")}</g>`
      + `<g class="umt-rn-runes">${clusters.map((cluster) => cluster.nodes.map((node) => runeMarkup(node, model, view, fresh)).join("")).join("")}</g>`
      + `<g class="umt-rn-knots">${model.combos.map((combo) => knotMarkup(combo, view, fresh)).join("")}</g>`
      + `<g class="umt-rn-far" aria-hidden="true">${titles}</g>`
      + `</g></svg>`
      + `<div class="umt-rn-zoom" role="group" aria-label="Zoom">`
      + `<button type="button" data-umt-rn-zoom="in" aria-label="Zoom in">+</button>`
      + `<button type="button" data-umt-rn-zoom="out" aria-label="Zoom out">−</button>`
      + `<button type="button" data-umt-rn-zoom="fit" aria-label="Show the whole map">⤢</button>`
      + `</div></div>`;
  }

  // ---------------------------------------------------------------------
  // Camera: where the map is looking (a world point at the centre of the
  // view, and a scale), plus pan / pinch / wheel zoom and smooth flights.
  // ---------------------------------------------------------------------

  const camera = { cx: 0, cy: 0, s: 0.3, anim: null, fitted: false };
  const MAX_SCALE = 2.2;
  const LOD_NEAR = 0.52;

  function mapParts() {
    const layer = host() && host().querySelector(".umt-pt-layer");
    const map = layer && layer.querySelector("[data-umt-rn-map]");
    const svg = map && map.querySelector(".umt-rn-svg");
    const world = svg && svg.querySelector("[data-umt-rn-world]");
    if (!world) return null;
    const box = map.getBoundingClientRect();
    const [minX, minY, maxX, maxY] = (svg.getAttribute("data-bounds") || "-800 -800 800 800").split(" ").map(Number);
    return { layer, map, svg, world, w: box.width, h: box.height, bounds: { minX, minY, maxX, maxY } };
  }

  function fitScale(parts, bounds, pad = 24) {
    const bw = bounds.maxX - bounds.minX;
    const bh = bounds.maxY - bounds.minY;
    return Math.min((parts.w - pad * 2) / bw, (parts.h - pad * 2) / bh);
  }

  function minScale(parts) {
    return fitScale(parts, parts.bounds) * 0.85;
  }

  function applyCamera() {
    const parts = mapParts();
    if (!parts || !parts.w) return;
    camera.s = Math.min(MAX_SCALE, Math.max(minScale(parts), camera.s));
    const tx = parts.w / 2 - camera.s * camera.cx;
    const ty = parts.h / 2 - camera.s * camera.cy;
    parts.world.setAttribute("transform", `translate(${r1(tx)} ${r1(ty)}) scale(${camera.s.toFixed(4)})`);
    parts.svg.setAttribute("data-lod", camera.s >= LOD_NEAR ? "near" : "far");
  }

  function stopFlight() {
    if (camera.anim) cancelAnimationFrame(camera.anim);
    camera.anim = null;
  }

  // Smoothly to a new view; zooms in log space so it doesn't lurch.
  function flyTo(target, ms, done) {
    stopFlight();
    const from = { cx: camera.cx, cy: camera.cy, s: camera.s };
    if (!ms || reducedMotion()) {
      Object.assign(camera, { cx: target.cx, cy: target.cy, s: target.s });
      applyCamera();
      if (done) done();
      return;
    }
    const start = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const k = ease(t);
      camera.cx = from.cx + (target.cx - from.cx) * k;
      camera.cy = from.cy + (target.cy - from.cy) * k;
      camera.s = Math.exp(Math.log(from.s) + (Math.log(target.s) - Math.log(from.s)) * k);
      applyCamera();
      if (t < 1) camera.anim = requestAnimationFrame(step);
      else {
        camera.anim = null;
        if (done) done();
      }
    };
    camera.anim = requestAnimationFrame(step);
  }

  function viewOf(bounds, pad) {
    const parts = mapParts();
    if (!parts) return null;
    return {
      cx: (bounds.minX + bounds.maxX) / 2,
      cy: (bounds.minY + bounds.maxY) / 2,
      s: Math.min(MAX_SCALE, fitScale(parts, bounds, pad))
    };
  }

  function fitAll(ms) {
    const parts = mapParts();
    if (!parts) return;
    const target = viewOf(parts.bounds, 16);
    if (target) flyTo(target, ms);
    camera.fitted = true;
  }

  // Close enough that a rune and its name read comfortably.
  function viewOnPoint(x, y, scale) {
    const parts = mapParts();
    const s = Math.min(MAX_SCALE, Math.max(scale, parts ? minScale(parts) : scale));
    return { cx: x, cy: y, s };
  }

  function zoomAt(factor, px, py) {
    const parts = mapParts();
    if (!parts) return;
    stopFlight();
    const sx = px == null ? parts.w / 2 : px;
    const sy = py == null ? parts.h / 2 : py;
    const tx = parts.w / 2 - camera.s * camera.cx;
    const ty = parts.h / 2 - camera.s * camera.cy;
    const wx = (sx - tx) / camera.s;
    const wy = (sy - ty) / camera.s;
    const s = Math.min(MAX_SCALE, Math.max(minScale(parts), camera.s * factor));
    camera.s = s;
    camera.cx = (parts.w / 2 - (sx - s * wx)) / s;
    camera.cy = (parts.h / 2 - (sy - s * wy)) / s;
    applyCamera();
  }

  function nodePoint(id) {
    const model = view.game ? buildModel(view.game, view.aspect) : null;
    const node = model && model.nodes.get(id);
    return node && Number.isFinite(node.x) ? node : null;
  }

  function clusterBounds(cluster) {
    return {
      minX: cluster.x - cluster.reach, maxX: cluster.x + cluster.reach,
      minY: cluster.y - cluster.reach, maxY: cluster.y + cluster.reach
    };
  }

  // Pointer gestures on the map: drag to pan, two fingers to pinch, wheel
  // to zoom. A press that barely moves stays a tap (selection).
  const gesture = { pointers: new Map(), moved: false, startDist: 0, startScale: 1, suppressClick: false };

  function installMapGestures() {
    document.addEventListener("pointerdown", (event) => {
      const map = event.target instanceof Element && event.target.closest(".umt-pt-layer [data-umt-rn-map]");
      if (!map || event.target.closest(".umt-rn-zoom")) return;
      gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture.pointers.size === 1) gesture.moved = false;
      if (gesture.pointers.size === 2) {
        const [a, b] = [...gesture.pointers.values()];
        gesture.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        gesture.startScale = camera.s;
      }
    });
    document.addEventListener("pointermove", (event) => {
      if (!gesture.pointers.has(event.pointerId)) return;
      const prev = gesture.pointers.get(event.pointerId);
      const next = { x: event.clientX, y: event.clientY };
      gesture.pointers.set(event.pointerId, next);
      const parts = mapParts();
      if (!parts) return;
      if (gesture.pointers.size >= 2) {
        const [a, b] = [...gesture.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const box = parts.map.getBoundingClientRect();
        const factor = (gesture.startScale * (dist / gesture.startDist)) / camera.s;
        zoomAt(factor, (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top);
        gesture.moved = true;
        return;
      }
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      if (!gesture.moved && Math.hypot(next.x - prev.x, next.y - prev.y) < 0.5) return;
      gesture.moved = gesture.moved || Math.abs(dx) + Math.abs(dy) > 0;
      stopFlight();
      camera.cx -= dx / camera.s;
      camera.cy -= dy / camera.s;
      applyCamera();
    });
    const end = (event) => {
      if (!gesture.pointers.has(event.pointerId)) return;
      gesture.pointers.delete(event.pointerId);
      if (!gesture.pointers.size && gesture.moved) {
        // A drag ends in a click on whatever it started on; swallow that one.
        gesture.suppressClick = true;
        setTimeout(() => { gesture.suppressClick = false; }, 0);
      }
    };
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("wheel", (event) => {
      const map = event.target instanceof Element && event.target.closest(".umt-pt-layer [data-umt-rn-map]");
      if (!map) return;
      event.preventDefault();
      const box = map.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0016), event.clientX - box.left, event.clientY - box.top);
    }, { passive: false });
    window.addEventListener("resize", () => {
      if (!view.open) return;
      const aspect = mapAspect();
      if ((aspect < 0.85) !== (view.aspect < 0.85)) {
        view.aspect = aspect;
        renderOverlay();
        fitAll(0);
      } else applyCamera();
    });
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
    lastFocus: null,
    // The reveal's choreography: which step it is on, and its timers.
    stage: null,
    timers: []
  };

  function stageLabel(round) {
    return `Stage ${Math.max(1, num(round, 1))}`;
  }

  function detailMarkup(model, node) {
    if (!node) {
      return `<div class="umt-pt-detail is-empty"><p>Tap a rune to see what it does and how to get it. Lit runes are yours; the ring colour is its rarity. Rose strings join a combo: own both ends and its knot lights up with the bonus.</p></div>`;
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
      + `<button type="button" class="umt-rn-deselect" data-umt-pz-deselect aria-label="Close details">×</button>`
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
  const EPIC_PICK_IDS = new Set(["doubleMulligans", "biggerMulligans", "questCadence", "secondCup"]);
  function pickTierName(id) {
    if (id === "revealGreen") return "a Common";
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
    lines.push(`Between-round reward${tier ? ` (${tier})` : ""}: offered on the reward screen after a stage.`);
    lines.push("Can also turn up on the shop's permanent shelf, priced by rarity.");
    if (LEGENDARY_PICK_IDS.has(node.id) && node.tier !== "legendary") lines.push(`Can also show up as ${pickTierName(node.id)} reward.`);
    if (node.easyOnly) lines.push("Only offered on Easy difficulty.");
    return lines;
  }

  // What the map's marks mean.
  function legendMarkup() {
    const tier = (id) => `<li><span class="umt-rn-key-ring" style="--t:${TIER_STROKE[id]}"></span>${TIER_NAME[id]}</li>`;
    return `<details class="umt-pt-key umt-rn-key"><summary>Key</summary><ul>`
      + `<li><span class="umt-rn-key-rune is-owned"></span>Yours</li>`
      + `<li><span class="umt-rn-key-rune"></span>Not yet</li>`
      + `<li class="is-wide"><span class="umt-rn-key-line is-combo"></span><span class="umt-rn-key-knot"></span>Combo: own both ends for its bonus</li>`
      + `<li class="is-wide"><span class="umt-rn-key-line"></span>Related runes</li>`
      + `<li class="is-wide is-label">Ring colour = rarity</li>`
      + tier("common") + tier("rare") + tier("epic") + tier("legendary")
      + `</ul></details>`;
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
    const comboNote = combosNow.length
      ? `<div class="umt-rn-bonus"><h4>Bonus unlocked</h4>${combosNow.map(fusionMarkup).join("")}</div>`
      : "";
    return `<section class="umt-pt-reveal">${items}${comboNote}</section>`;
  }

  function overlayMarkup(game) {
    const model = buildModel(game, view.aspect);
    const reveal = view.mode === "reveal" ? view.reveal : null;
    const selected = view.selectedId ? model.nodes.get(view.selectedId) : null;
    const percent = model.total ? Math.round((model.owned / model.total) * 100) : 0;
    const heading = reveal
      ? `<span class="umt-pt-kicker">Progression</span><h2 id="umtPtTitle">${revealGroups(model, reveal).length > 1 ? "New runes" : "New rune"} lit</h2>`
      : `<span class="umt-pt-kicker">Progression</span><h2 id="umtPtTitle">Your runes</h2>`;
    const side = reveal
      ? revealMarkup(model, reveal)
      : detailMarkup(model, selected) + (selected ? "" : timelineMarkup(model, game));
    return `<div class="umt-pt-overlay${reveal ? " is-reveal" : ""}" role="dialog" aria-modal="true" aria-hidden="false" aria-labelledby="umtPtTitle">`
      + `<div class="umt-pt-backdrop" data-umt-pt-close></div>`
      + `<section class="umt-pt-modal umt-rn-modal">`
      + `<header class="umt-pt-head"><div>${heading}</div>`
      + `<div class="umt-pt-progress" title="${model.owned} of ${model.total} runes lit"><span style="width:${percent}%"></span></div>`
      + `<span class="umt-pt-count">${model.owned}<small>/${model.total}</small></span>`
      + `<button type="button" class="umt-pt-close" data-umt-pt-close aria-label="Close progression">×</button></header>`
      + `<div class="umt-pt-body umt-rn-body${reveal || selected ? " has-detail" : ""}">`
      + `<div class="umt-rn-stage">${legendMarkup()}${mapMarkup(model, view)}</div>`
      + `<aside class="umt-pt-side umt-rn-side">${side}</aside>`
      + `</div>`
      + (reveal ? `<footer class="umt-pt-foot"><button type="button" class="umt-pt-continue" data-umt-pt-close>Continue</button></footer>` : "")
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
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "umt-pt-layer";
      el.appendChild(layer);
    }
    // The game re-renders around a pick, and every re-render used to
    // rebuild the whole panel -- replaying its entrance. Skip a redraw that
    // would change nothing, and when something did change, redraw without
    // replaying the entrance. The camera and the reveal's step live outside
    // the markup, so they carry straight over.
    const markup = overlayMarkup(view.game);
    if (layer.umtMarkup === markup && layer.umtOpenId === view.openId) return;
    const settled = layer.umtOpenId === view.openId && Boolean(layer.umtMarkup);
    layer.innerHTML = markup;
    layer.umtMarkup = markup;
    layer.umtOpenId = view.openId;
    layer.classList.toggle("is-settled", settled);
    if (view.stage) layer.setAttribute("data-stage", view.stage);
    else layer.removeAttribute("data-stage");
    applyCamera();
  }

  // The map's shape before it exists, from the window (the modal's layout:
  // full screen on a phone, a side panel beside the map on wider screens).
  function mapAspect() {
    const w = window.innerWidth || 1024;
    const h = window.innerHeight || 768;
    if (w <= 760) return w / Math.max(1, h - 70);
    return (Math.min(1140, w - 32) - 340) / Math.max(1, Math.min(840, h - 32) - 70);
  }

  function setStage(stage) {
    view.stage = stage;
    const layer = host() && host().querySelector(".umt-pt-layer");
    if (!layer) return;
    if (stage) layer.setAttribute("data-stage", stage);
    else layer.removeAttribute("data-stage");
  }

  function clearReveal() {
    view.timers.forEach((timer) => clearTimeout(timer));
    view.timers = [];
    stopFlight();
  }

  function later(ms, fn) {
    view.timers.push(setTimeout(fn, reducedMotion() ? 0 : ms));
  }

  // The reveal: the whole map first, then a flight in to the new rune,
  // which ignites; if it completed a combo, the view pulls back to both
  // ends, the combo string draws itself and the knot pops with the bonus.
  function playReveal() {
    clearReveal();
    const model = buildModel(view.game, view.aspect);
    const fresh = [...view.freshIds].map((id) => model.nodes.get(id)).filter((n) => n && Number.isFinite(n.x));
    const rune = fresh.find((n) => n.kind !== "combo") || fresh[0];
    const combo = model.combos.find((c) => view.reveal && view.reveal.newComboIds && view.reveal.newComboIds.has(c.id));
    setStage("overview");
    fitAll(0);
    if (!rune) {
      setStage("done");
      return;
    }
    later(300, () => {
      setStage("fly");
      flyTo(viewOnPoint(rune.x, rune.y, 1.35), 850, () => {
        setStage("ignite");
        if (!combo) {
          later(1200, () => setStage("done"));
          return;
        }
        later(1100, () => {
          setStage("combo-fly");
          const ends = combo.halves.concat([combo]);
          const box = {
            minX: Math.min(...ends.map((n) => n.x)) - 90, maxX: Math.max(...ends.map((n) => n.x)) + 90,
            minY: Math.min(...ends.map((n) => n.y)) - 90, maxY: Math.max(...ends.map((n) => n.y)) + 90
          };
          flyTo(viewOf(box, 20), 750, () => {
            setStage("combo");
            later(1600, () => setStage("done"));
          });
        });
      });
    });
  }

  function openTree(game, options = {}) {
    if (!game || !game.state) return;
    clearReveal();
    view.game = game;
    view.open = true;
    view.mode = options.reveal ? "reveal" : "browse";
    view.reveal = options.reveal || null;
    view.freshIds = options.freshIds || new Set();
    view.selectedId = options.selectedId || null;
    view.lastFocus = document.activeElement;
    view.openId = (view.openId || 0) + 1;
    view.stage = null;
    view.aspect = mapAspect();
    renderOverlay();
    requestAnimationFrame(() => {
      if (view.mode === "reveal") playReveal();
      else {
        fitAll(0);
        const focus = view.selectedId && nodePoint(view.selectedId);
        if (focus) flyTo(viewOnPoint(focus.x, focus.y, 1.1), 600);
      }
      const closeBtn = host() && host().querySelector(options.reveal ? ".umt-pt-continue" : ".umt-pt-close");
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    });
  }

  function closeTree() {
    if (!view.open) return;
    clearReveal();
    view.open = false;
    view.reveal = null;
    view.stage = null;
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
      clearReveal();
      view.mode = "browse";
      view.reveal = null;
      view.stage = null;
      view.freshIds = new Set();
    }
    renderOverlay();
    // From far out, a tap also brings the rune close enough to read.
    const point = id && nodePoint(id);
    if (point && camera.s < 0.8) flyTo(viewOnPoint(point.x, point.y, 1.1), 650);
  }

  function zoomToCluster(id) {
    const model = buildModel(view.game, view.aspect);
    const cluster = model.clusters.find((c) => c.id === id);
    if (!cluster) return;
    const target = viewOf(clusterBounds(cluster), 12);
    if (target) flyTo(target, 650);
  }

  // ---------------------------------------------------------------------
  // Pick detection -> reveal
  // ---------------------------------------------------------------------

  const watch = { runId: null, ledgerLength: 0, comboOwned: new Set(), pending: null };

  function ownedComboIds(game) {
    const model = buildModel(game);
    return new Set(model.combos.filter((c) => c.level > 0).map((c) => c.id));
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
      watch.comboOwned = ownedComboIds(game);
      return;
    }
    if (entries.length === watch.ledgerLength) return;
    // A boss reward lands while its cash-out is still counting up; hold the
    // reveal (the ledger stays unread) until Collect, instead of opening it
    // on top of the cash-out.
    if (payoutShowing(game)) return;
    const fresh = entries.slice(watch.ledgerLength);
    const combosNow = ownedComboIds(game);
    const newComboIds = new Set([...combosNow].filter((id) => !watch.comboOwned.has(id)));
    watch.ledgerLength = entries.length;
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
        const comboNews = [...newComboIds].some((id) => !view.reveal.newComboIds.has(id));
        newComboIds.forEach((id) => view.reveal.newComboIds.add(id));
        freshIds.forEach((id) => view.freshIds.add(id));
        renderOverlay();
        // A combo completed by the second application gets its own moment.
        if (comboNews) playReveal();
        return;
      }
      openTree(game, { reveal: { entries: fresh, newComboIds }, freshIds });
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
  // Quest banner: when a quest turns up mid-stage, a small "Quest!" pill
  // swooshes in over the board and straight out again -- just the alert;
  // what the quest asks stays in the quest strip above the board.
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
    setTimeout(() => el.remove(), 340);
  }

  function showQuestBanner() {
    const el = host();
    if (!el) return;
    dismissQuestBanner(true);
    const wrap = document.createElement("div");
    wrap.className = "umt-quest-banner-wrap";
    const Icons = window.CuddleIcons;
    wrap.innerHTML = `<div class="umt-quest-banner" role="status" aria-live="polite">`
      + `<span class="umt-qb-icon" aria-hidden="true">${Icons ? Icons.svg("📜") : ""}</span>`
      + `<strong>Quest!</strong>`
      + `</div>`;
    el.appendChild(wrap);
    questBanner.el = wrap;
    wrap.firstElementChild.addEventListener("click", () => dismissQuestBanner(false));
    questBanner.timer = setTimeout(() => dismissQuestBanner(false), 1000);
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
    showQuestBanner();
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
      if (gesture.suppressClick && target.closest(".umt-pt-layer [data-umt-rn-map]")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (target.closest("[data-umt-pt-close]")) {
        event.preventDefault();
        closeTree();
        return;
      }
      const zoom = target.closest(".umt-pt-layer [data-umt-rn-zoom]");
      if (zoom) {
        event.preventDefault();
        const how = zoom.dataset.umtRnZoom;
        if (how === "fit") fitAll(500);
        else zoomAt(how === "in" ? 1.45 : 1 / 1.45);
        return;
      }
      const sigil = target.closest(".umt-pt-layer [data-umt-cluster]");
      if (sigil) {
        event.preventDefault();
        zoomToCluster(sigil.dataset.umtCluster);
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
      const sigil = event.target instanceof Element && event.target.closest(".umt-pt-layer [data-umt-cluster]");
      if (sigil && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.stopPropagation();
        zoomToCluster(sigil.dataset.umtCluster);
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
  installMapGestures();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  window.CuddleProgression = Object.freeze({
    openTree: (game) => openTree(game || activeGame()),
    closeTree,
    buildModel
  });
})();
