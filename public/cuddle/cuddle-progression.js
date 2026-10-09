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
//   2. The badge page. Every reward the run picks up becomes a hexagon
//      badge -- its name and what it does in a few words -- in the order
//      it came; hover or tap one for its full card. Combos formed by two
//      badges sit in their own column. Picking something up opens the page
//      by itself and the new badge unlocks with a sparkle.
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
  // Badge model: the rewards this run has collected, in the order they
  // came, plus the combos they've formed
  // ---------------------------------------------------------------------

  // Bronze / silver / purple / gold, as on the reward cards' rarity badges.
  const TIER_STROKE = { common: "#c98a4b", rare: "#c6d0de", epic: "#b98cff", legendary: "#f6c956" };
  const TIER_NAME = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
  const COMBO_COLOR = "#ff7ab8";

  // What each badge does, in a few words.
  const SHORT = {
    extraMulligans: "+1 mulligan each stage",
    questRefreshes: "+1 reward refresh",
    questPoints: "+10 points per quest",
    questReroll: "Free quest reroll",
    mulliganSize: "Mulligans swap +1",
    cullOne: "Cuts 1 rare letter",
    cullTwo: "Cuts 2 rare letters",
    categorySense: "+1 theme shown (all at level 3)",
    storybookStart: "+10 points per stage",
    wideChoice: "+1 reward choice",
    handSizeBoost: "+1 card in hand",
    mulliganValueBoost: "+3 per spare mulligan",
    earlySolveBoost: "+5 per spare guess",
    colourTrade: "Greens worth more",
    greyscale: "Greys worth more",
    rewardEcho: "Next reward counts twice",
    greenCount: "Greens show count",
    "surprise-assignment": "+1 surprise quest",
    treasureMap: "+1 special tile",
    mulliganTiles: "Unlocks mulligan tiles",
    jokerTiles: "Unlocks Joker tiles",
    oracleTiles: "Unlocks hint tiles",
    rainyDay: "10% interest per stage",
    encore: "+50 every 3rd solve",
    vowelBounty: "+5 per vowel solved",
    doubleDown: "+50 on lucky guess",
    vowelLamp: "Shows the vowel count",
    echoFinder: "Shows repeat letters",
    treasureHunter: "Quick treasure solves +$25",
    patternLens: "Shows vowel pattern",
    mistakeShield: "First miss refunded",
    haggler: "Cheaper refreshes",
    lastLight: "Last letter revealed",
    yellowHint: "Reveals 1 letter",
    jokerCache: "+1 Joker each stage",
    jokerCacheLarge: "+2 Jokers each stage",
    "alphabet-compass": "Earlier / later hints",
    consonantSweep: "Rules out 1 consonant per guess",
    coachPossibleAnswers: "Shows answers left",
    coachMeterThreshold: "Cuddle Meter fills sooner",
    coachMeterReward: "Bigger meter reward",
    cullRare: "Cuts 4 rare letters",
    doubleMulligans: "Mulligans doubled",
    biggerMulligans: "Mulligans swap 5",
    freeVowelSweep: "Free vowel test",
    revealGreen: "Next stage: 1 letter",
    questDoublePick: "Pick 2 quest rewards",
    questCadence: "More quests at once",
    questPersistReward: "Quests last all stage",
    allThemesBoss: "All themes revealed",
    secondCup: "1 rescue guess per run",
  };

  // Reward ids come in a few spellings across the add-on layers
  // ("umtRainyDay" for the catalogue's "rainyDay"); fold them together.
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

  function shortText(node) {
    // A power with levels says what its current level does.
    const tree = window.CuddleSkillTree;
    if (Array.isArray(node.levels) && node.levels.length && node.level > 0 && tree && typeof tree.levelText === "function") {
      return tree.levelText(node, node.level).replace(/\.$/, "");
    }
    if (SHORT[node.id]) return SHORT[node.id];
    if (SHORT[canonicalId(node.id)]) return SHORT[canonicalId(node.id)];
    const text = String(node.description || "").split(/(?<=\.)\s/)[0].replace(/\.$/, "");
    return text.length > 44 ? `${text.slice(0, 42).replace(/\s+\S*$/, "")}…` : text;
  }

  function comboEffect(combo) {
    const listed = window.CuddleSynergies && Array.isArray(window.CuddleSynergies.combos)
      ? window.CuddleSynergies.combos.find((item) => item.id === combo.id) : null;
    if (listed && listed.effect) return listed.effect;
    const text = String(combo.description || "");
    return text.includes(": ") ? text.slice(text.indexOf(": ") + 2) : text;
  }

  // The catalogue gives every reward its name, icon and wording; the run's
  // pick ledger says which ones this run has and in what order.
  function buildModel(game) {
    const tree = window.CuddleSkillTree;
    const nodes = new Map();
    const addNode = (base, extra) => {
      if (!base || nodes.has(base.id)) return nodes.get(base && base.id);
      const node = {
        id: base.id,
        title: base.title || base.id,
        icon: base.icon || "✦",
        tier: base.tier || "common",
        description: base.description || "",
        maxLevel: Number.isFinite(base.maxLevel) ? base.maxLevel : null,
        type: base.type || null,
        levels: Array.isArray(base.levels) ? base.levels.slice() : null,
        requires: Array.isArray(base.requires) ? base.requires.slice() : null,
        kind: "upgrade",
        level: 0,
        picks: [],
        first: Infinity,
        ...extra
      };
      nodes.set(node.id, node);
      return node;
    };
    if (tree) {
      for (const branch of tree.BRANCHES) {
        for (const base of branch.nodes) {
          addNode(base, { kind: branch.id === "bossRewards" ? "boss" : branch.id === "synergyCombos" ? "combo" : "upgrade" });
        }
      }
    }
    ledger(game).forEach((entry, index) => {
      if (!entry) return;
      let node = resolveCatalogueNode(tree, entry.id, entry.title);
      node = node ? nodes.get(node.id) : null;
      if (!node) {
        node = nodes.get(entry.id) || addNode({ id: entry.id, title: entry.title, icon: entry.icon, description: entry.description },
          { kind: entry.kind === "boss" ? "boss" : "upgrade" });
      }
      node.level += 1;
      node.first = Math.min(node.first, index);
      node.picks.push({ round: num(entry.round, 1), order: index });
    });
    // Sorted by type (the badge page's sections), then rarity, then name.
    const collected = [...nodes.values()].filter((n) => n.kind !== "combo" && n.level > 0).sort((a, b) => a.first - b.first);
    const badges = tree && typeof tree.sortByType === "function" ? tree.sortByType(collected, (n) => n) : collected;
    // A combo is earned once both of its halves are; it joins the list at
    // the moment the second half arrived.
    const synergies = window.CuddleSynergies;
    const combos = [...nodes.values()].filter((n) => n.kind === "combo" && n.requires).map((combo) => {
      combo.halves = combo.requires.map((id) => nodes.get(id) || nodes.get(canonicalId(id))).filter(Boolean);
      let owned = combo.halves.length === combo.requires.length && combo.halves.every((n) => n.level > 0);
      if (!owned && synergies && typeof synergies.owns === "function") {
        try { owned = Boolean(synergies.owns(game, combo.id)); } catch (_error) { owned = false; }
      }
      combo.level = owned ? 1 : 0;
      combo.first = Math.max(...combo.halves.map((n) => n.first).filter(Number.isFinite), -1);
      return combo;
    }).filter((combo) => combo.level > 0).sort((a, b) => a.first - b.first);
    return { nodes, badges, combos };
  }

  // ---------------------------------------------------------------------
  // Badge page: collected badges in the order they came, combos beside
  // them, a card on hover or tap
  // ---------------------------------------------------------------------

  // A pointy-topped hexagon, a little taller than it is wide.
  const HEX = "M50 2 L96 28 L96 88 L50 114 L4 88 L4 28 Z";
  const HEX_INNER = "M50 9 L90 32 L90 84 L50 107 L10 84 L10 32 Z";

  function iconMarkup(icon) {
    const text = String(icon || "✦");
    const Icons = window.CuddleIcons;
    if (Icons && Icons.hasEmoji(text)) return Icons.svg(text);
    return `<span class="umt-bd-glyph">${esc(text)}</span>`;
  }

  function sparkles() {
    return `<span class="umt-bd-sparks" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<i style="--a:${i * 45}deg;--d:${(i % 2) * 70}ms"></i>`).join("")}</span>`;
  }

  function badgeMarkup(node, fresh, linking) {
    const color = node.kind === "combo" ? COMBO_COLOR : TIER_STROKE[node.tier] || TIER_STROKE.common;
    const level = node.maxLevel && node.maxLevel > 1
      ? `<span class="umt-bd-level">${node.level}/${node.maxLevel}</span>`
      : node.level > 1 ? `<span class="umt-bd-level">×${node.level}</span>` : "";
    const classes = ["umt-bd-badge", node.kind === "combo" ? "is-combo" : "", fresh.has(node.id) ? "is-new" : "", linking.has(node.id) ? "is-linking" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${classes}" data-umt-badge="${esc(node.id)}" style="--t:${color}"`
      + ` aria-label="${esc(node.title)}${node.kind === "combo" ? " (combo)" : ""}. ${esc(shortText(node))}.">`
      + `<svg class="umt-bd-hex" viewBox="0 0 100 116" aria-hidden="true"><path class="umt-bd-hex-fill" d="${HEX}"/><path class="umt-bd-hex-line" d="${HEX_INNER}"/></svg>`
      + `<span class="umt-bd-face"><span class="umt-bd-icon" aria-hidden="true">${iconMarkup(node.icon)}</span>`
      + `<strong class="umt-bd-name">${esc(node.title)}</strong>`
      + (node.kind === "combo" ? "" : `<small class="umt-bd-short">${esc(shortText(node))}</small>`)
      + `</span>${level}${sparkles()}</button>`;
  }

  function cardMarkup(model, node) {
    if (!node) return "";
    const types = window.CuddleSkillTree && window.CuddleSkillTree.TYPES;
    const typeLabel = node.type && types && types[node.type] ? types[node.type].label : "";
    const tier = node.kind === "combo" ? "Combo"
      : [TIER_NAME[node.tier] || "Common", typeLabel, node.kind === "boss" ? "Boss reward" : ""].filter(Boolean).join(" · ");
    const color = node.kind === "combo" ? COMBO_COLOR : TIER_STROKE[node.tier] || TIER_STROKE.common;
    const levelText = node.kind === "combo" ? ""
      : node.maxLevel && node.maxLevel > 1 ? `Level ${node.level} of ${node.maxLevel}${node.level >= node.maxLevel ? " (max)" : ""}`
        : node.level > 1 ? `Taken ${node.level} times` : "";
    // A stackable power: what it does now, and what the next pick adds.
    const tree = window.CuddleSkillTree;
    const nextText = node.kind !== "combo" && Array.isArray(node.levels) && node.level < node.levels.length && tree
      ? `<p class="umt-bd-card-next"><b>Level ${node.level + 1}${node.level + 1 === node.maxLevel ? " (max)" : ""}:</b> ${esc(tree.levelText(node, node.level + 1))}</p>` : "";
    const when = node.picks && node.picks.length
      ? `Picked up on ${[...new Set(node.picks.map((p) => `stage ${Math.max(1, p.round)}`))].join(", ")}` : "";
    const body = node.kind === "combo"
      ? `<p class="umt-bd-card-halves">${(node.halves || []).map((h) => esc(h.title)).join(" + ")}</p><p>${esc(comboEffect(node))}</p>`
      : Array.isArray(node.levels) && node.levels.length && tree
        ? `<p>${esc(tree.levelText(node, Math.max(1, node.level)))}</p>${nextText}`
        : `<p>${esc(node.description)}</p>`;
    return `<div class="umt-bd-card-inner" style="--t:${color}">`
      + `<div class="umt-bd-card-head"><span class="umt-bd-card-icon" aria-hidden="true">${iconMarkup(node.icon)}</span>`
      + `<div><strong>${esc(node.title)}</strong><span class="umt-bd-card-tier">${esc(tier)}</span></div></div>`
      + body
      + (levelText || when ? `<p class="umt-bd-card-meta">${esc([levelText, when].filter(Boolean).join(" · "))}</p>` : "")
      + `</div>`;
  }

  const view = {
    open: false,
    mode: "browse",
    freshIds: new Set(),
    reveal: null,
    game: null,
    lastFocus: null,
    cardId: null,
    cardPinned: false
  };

  function overlayMarkup(game) {
    const model = buildModel(game);
    const reveal = view.mode === "reveal" ? view.reveal : null;
    const fresh = view.freshIds || new Set();
    // A combo that just formed makes its two badges light up as it arrives.
    const linking = new Set();
    model.combos.filter((combo) => fresh.has(combo.id)).forEach((combo) => combo.halves.forEach((h) => linking.add(h.id)));
    // One section per type, in the registry's order.
    const tree = window.CuddleSkillTree;
    const types = tree && tree.TYPES ? tree.TYPES : {};
    const order = tree && Array.isArray(tree.TYPE_ORDER) ? tree.TYPE_ORDER.concat([null]) : [null];
    const sections = order.map((type) => ({
      type,
      info: type ? types[type] : { label: "Other", color: "#aaa5bc" },
      items: model.badges.filter((node) => (type ? node.type === type : !node.type || !types[node.type]))
    })).filter((section) => section.items.length);
    const grid = model.badges.length
      ? sections.map((section) => `<section class="umt-bd-type" style="--type:${section.info.color}" aria-label="${esc(section.info.label)}">`
        + `<h3 class="umt-bd-type-head"><i aria-hidden="true"></i>${esc(section.info.label)}<small>${section.items.length}</small></h3>`
        + `<div class="umt-bd-grid">${section.items.map((node) => badgeMarkup(node, fresh, linking)).join("")}</div></section>`).join("")
      : `<p class="umt-bd-empty">No badges yet. Every reward you pick up lands here.</p>`;
    // The combo column only appears once there is a combo to show.
    const combos = model.combos.length
      ? `<aside class="umt-bd-combos" aria-label="Combos"><h3>Combos</h3><div class="umt-bd-combo-list">${model.combos.map((node) => badgeMarkup(node, fresh, linking)).join("")}</div></aside>`
      : "";
    return `<div class="umt-pt-overlay umt-bd-overlay${reveal ? " is-reveal" : ""}" role="dialog" aria-modal="true" aria-labelledby="umtPtTitle">`
      + `<div class="umt-pt-backdrop" data-umt-pt-close></div>`
      + `<section class="umt-pt-modal umt-bd-modal">`
      + `<header class="umt-pt-head"><div><h2 id="umtPtTitle">Badges</h2></div>`
      + `<span class="umt-pt-count">${model.badges.length}<small> badge${model.badges.length === 1 ? "" : "s"}</small></span>`
      + `<button type="button" class="umt-pt-close" data-umt-pt-close aria-label="Close badges">×</button></header>`
      + `<div class="umt-bd-body${combos ? " has-combos" : ""}">`
      + `<section class="umt-bd-main" aria-label="Badges, by type">${grid}</section>`
      + combos
      + `</div>`
      + (reveal ? `<footer class="umt-pt-foot"><button type="button" class="umt-pt-continue" data-umt-pt-close>Continue</button></footer>` : "")
      + `<div class="umt-bd-card" role="tooltip" hidden></div>`
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
    // The game re-renders around a pick; skip a redraw that would change
    // nothing, and redraw without replaying the unlock when one did.
    const markup = overlayMarkup(view.game);
    if (layer.umtMarkup === markup && layer.umtOpenId === view.openId) return;
    const settled = layer.umtOpenId === view.openId && Boolean(layer.umtMarkup);
    layer.innerHTML = markup;
    layer.umtMarkup = markup;
    layer.umtOpenId = view.openId;
    layer.classList.toggle("is-settled", settled);
    if (view.cardId) showCard(view.cardId, view.cardPinned);
  }

  // The card: one floating panel, placed beside whichever badge it's for.
  function showCard(id, pinned) {
    const layer = host() && host().querySelector(".umt-pt-layer");
    const card = layer && layer.querySelector(".umt-bd-card");
    const badge = layer && layer.querySelector(`[data-umt-badge="${CSS.escape(id)}"]`);
    if (!card || !badge) return;
    const model = buildModel(view.game);
    card.innerHTML = cardMarkup(model, model.nodes.get(id));
    card.hidden = false;
    view.cardId = id;
    view.cardPinned = Boolean(pinned);
    layer.querySelectorAll(".umt-bd-badge.is-active, .umt-bd-badge.is-half").forEach((el) => el.classList.remove("is-active", "is-half"));
    badge.classList.add("is-active");
    // Hovering a combo points out its two badges.
    const node = model.nodes.get(id);
    if (node && node.kind === "combo") {
      (node.halves || []).forEach((h) => {
        const half = layer.querySelector(`.umt-bd-main [data-umt-badge="${CSS.escape(h.id)}"]`);
        if (half) half.classList.add("is-half");
      });
    }
    const modal = layer.querySelector(".umt-bd-modal").getBoundingClientRect();
    const box = badge.getBoundingClientRect();
    const w = Math.min(300, modal.width - 24);
    card.style.width = `${w}px`;
    const h = card.offsetHeight;
    let left = box.left + box.width / 2 - w / 2;
    left = Math.max(modal.left + 12, Math.min(modal.right - w - 12, left));
    let top = box.top - h - 10;
    if (top < modal.top + 12) top = box.bottom + 10;
    if (top + h > modal.bottom - 12) top = Math.max(modal.top + 12, modal.bottom - h - 12);
    card.style.left = `${left - modal.left}px`;
    card.style.top = `${top - modal.top}px`;
  }

  function hideCard(force) {
    if (view.cardPinned && !force) return;
    const layer = host() && host().querySelector(".umt-pt-layer");
    const card = layer && layer.querySelector(".umt-bd-card");
    if (card) card.hidden = true;
    if (layer) layer.querySelectorAll(".umt-bd-badge.is-active, .umt-bd-badge.is-half").forEach((el) => el.classList.remove("is-active", "is-half"));
    view.cardId = null;
    view.cardPinned = false;
  }

  function openTree(game, options = {}) {
    if (!game || !game.state) return;
    view.game = game;
    view.open = true;
    view.mode = options.reveal ? "reveal" : "browse";
    view.reveal = options.reveal || null;
    view.freshIds = options.freshIds || new Set();
    view.cardId = null;
    view.cardPinned = false;
    view.lastFocus = document.activeElement;
    view.openId = (view.openId || 0) + 1;
    renderOverlay();
    requestAnimationFrame(() => {
      const layer = host() && host().querySelector(".umt-pt-layer");
      const first = layer && layer.querySelector(".umt-bd-main .umt-bd-badge.is-new, .umt-bd-badge.is-new");
      if (first) first.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
      const closeBtn = layer && layer.querySelector(options.reveal ? ".umt-pt-continue" : ".umt-pt-close");
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    });
  }

  function closeTree() {
    if (!view.open) return;
    view.open = false;
    view.reveal = null;
    view.freshIds = new Set();
    view.cardId = null;
    view.cardPinned = false;
    renderOverlay();
    if (view.lastFocus && typeof view.lastFocus.focus === "function" && document.contains(view.lastFocus)) {
      view.lastFocus.focus({ preventScroll: true });
    }
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
    // So does an Upgrade Pack on offer or being opened (cuddle-packs.js):
    // the pack shows its own cards, then the badges follow.
    if (state.umtPackOffer) return;
    // And an event's outcome screen (cuddle-expanded-stages.js).
    if (state.branchMap && state.branchMap.expandedEventResult) return;
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
        newComboIds.forEach((id) => view.reveal.newComboIds.add(id));
        freshIds.forEach((id) => view.freshIds.add(id));
        renderOverlay();
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
    doubleOrNothing: { icon: "⚖️", text: "Double or Nothing — solve fast to double the stage", kind: "hazard" },
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
      if (boss.gate !== "final") lines.push({ kind: "bonus", icon: "🎁", text: "Clear it to pick 1 of 3 legendary rewards" });
    }

    // A strict stage is lost outright if it isn't solved in time -- the
    // most important thing the banner can say about it.
    if (!boss && typeof game._hardGuessLimit === "function" && Number.isFinite(game._hardGuessLimit())) {
      lines.push({ kind: "hazard", icon: "⏱️", text: `Solve within ${game._hardGuessLimit()} guesses or the run is lost` });
    }

    const custom = state.cuddleRebalanceV5 || {};
    const variant = custom.activeVariant && custom.activeVariant.roundToken === token ? custom.activeVariant : null;
    if (variant && variant.kind === "doubleOrNothing") {
      const limit = window.CuddleRebalanceV5?.doubleOrNothingLimit?.(game) || 3;
      lines.push({ ...VARIANTS.doubleOrNothing, text: `Double or Nothing — solve by guess ${limit} to double the stage` });
    } else if (variant && VARIANTS[variant.kind]) lines.push(VARIANTS[variant.kind]);
    // A Classic Wordle pays its own clear bonus, in both currencies.
    if (variant && variant.kind === "plain" && num(variant.clearBonus) > 0) {
      content.onWin = { points: num(variant.clearBonus), money: num(variant.clearBonus), label: "Classic Wordle cleared" };
    }

    const mandatory = custom.activeChallenge && custom.activeChallenge.roundToken === token ? custom.activeChallenge : null;
    const mode = state.cuddleMoneyMode || {};
    const thisStage = (item) => item && (item.offeredRound == null || num(item.offeredRound) === num(state.round));
    const mini = (thisStage(mode.activeChallenge) && mode.activeChallenge)
      || (thisStage(mode.challengeOffer) && mode.challengeOffer) || null;
    const challenge = mandatory || mini;
    if (challenge) {
      const description = typeof challenge.description === "string" ? challenge.description : "";
      // A stage's own challenge(s): how hard it is, then each challenge on
      // its own line (and the easier half of a stacked stop, if any).
      const stop = mandatory && node && window.CuddleRebalanceV5?.stopVariant?.(game, node);
      const skulls = stop ? Number(stop.skulls) || 0 : 0;
      if (skulls) lines.push({ kind: "hazard", icon: "💀", text: `Difficulty: ${["", "Tricky", "Hard", "Brutal"][skulls]} (${skulls} of 3 skulls)` });
      if (stop && stop.ease === "luckyStart") lines.push({ kind: "bonus", icon: "🍀", text: "Lucky Start — one letter starts in its exact place" });
      if (stop && stop.ease === "themedWordle") lines.push({ kind: "bonus", icon: "🧭", text: "Themed — one of the answer's themes is revealed" });
      if (stop && Array.isArray(stop.parts) && stop.parts.length) {
        stop.parts.forEach((part) => lines.push({ kind: "hazard", icon: "⚡", text: `${part.label ? `${part.label} · ` : ""}${part.title} — ${part.text}` }));
      } else {
        lines.push({ kind: "hazard", icon: challenge.icon || "⚡", text: `${challenge.title || "Challenge"}${description ? ` — ${description}` : ""}` });
      }
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
  // Entry points: map-header Badges button, render hook
  // ---------------------------------------------------------------------

  function decorateMapHeader(root, game) {
    const slot = root.querySelector(".cuddle-branch-shell .cuddle-header-side-right");
    if (!slot || slot.querySelector(".umt-pt-open")) return;
    const model = buildModel(game);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "umt-pt-open";
    button.dataset.umtPtOpen = "1";
    button.setAttribute("aria-label", `Open badges, ${model.badges.length} collected`);
    button.innerHTML = `<span aria-hidden="true">⬢</span><span class="umt-pt-open-label">Badges</span><b>${model.badges.length}</b>`;
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
    // Capture phase, ahead of the game's own click handling.
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const open = target.closest("[data-umt-pt-open]");
      if (open) {
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
      // Tap a badge to pin its card open (tap it again, or anywhere else,
      // to let it go).
      const badge = target.closest(".umt-pt-layer [data-umt-badge]");
      if (badge) {
        event.preventDefault();
        const id = badge.dataset.umtBadge;
        if (view.cardPinned && view.cardId === id) hideCard(true);
        else showCard(id, true);
        return;
      }
      if (view.cardPinned && !target.closest(".umt-bd-card")) hideCard(true);
    }, true);

    // Hover (mouse) or keyboard focus shows a badge's card for as long as
    // the pointer or focus stays on it.
    document.addEventListener("pointerover", (event) => {
      if (!view.open || event.pointerType === "touch") return;
      const badge = event.target instanceof Element && event.target.closest(".umt-pt-layer [data-umt-badge]");
      if (badge && !view.cardPinned) showCard(badge.dataset.umtBadge, false);
    });
    document.addEventListener("pointerout", (event) => {
      if (!view.open || event.pointerType === "touch") return;
      const badge = event.target instanceof Element && event.target.closest(".umt-pt-layer [data-umt-badge]");
      const into = event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-umt-badge]");
      if (badge && into !== badge) hideCard(false);
    });
    document.addEventListener("focusin", (event) => {
      const badge = view.open && event.target instanceof Element && event.target.closest(".umt-pt-layer [data-umt-badge]");
      if (badge && !view.cardPinned) showCard(badge.dataset.umtBadge, false);
    });
    document.addEventListener("focusout", (event) => {
      const badge = view.open && event.target instanceof Element && event.target.closest(".umt-pt-layer [data-umt-badge]");
      if (badge) hideCard(false);
    });

    document.addEventListener("keydown", (event) => {
      if (!view.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeTree();
        return;
      }
      // Keep typing inside the badge page from reaching the word-building keys.
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

  // Every badge the run collected (combos last), as display data for the
  // end screen.
  function badgeList(game) {
    try {
      const model = buildModel(game);
      return model.badges.concat(model.combos).map((node) => ({
        id: node.id,
        title: node.title,
        icon: iconMarkup(node.icon),
        color: node.kind === "combo" ? COMBO_COLOR : TIER_STROKE[node.tier] || TIER_STROKE.common,
        kind: node.kind,
        level: node.level,
        maxLevel: node.maxLevel
      }));
    } catch (_error) {
      return [];
    }
  }

  window.CuddleProgression = Object.freeze({
    openTree: (game) => openTree(game || activeGame()),
    badgeList,
    closeTree,
    buildModel
  });
})();
