(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const QUEST_ICONS = {
    ROW: "quest-full-sweep",
    RARE: "quest-rare-letters",
    ALPHA: "quest-in-order",
    DOUBLES: "quest-double-trouble",
    CHAIN: "quest-word-chain",
    HARDMODE: "quest-hard-mode-streak",
    FIELDREPORT: "quest-field-report",
    ALTERNATING: "quest-zigzag",
    BOOKENDS: "quest-bookends",
    HALF_AM: "quest-a-to-p",
    HALF_NZ: "quest-k-to-z",
    VOWELSHORTAGE: "quest-vowel-shortage"
  };

  let updateFrame = 0;
  let updating = false;
  let lastBonusMatchKey = "";
  let lastQuestKey = "";
  let lastQuestProgress = null;
  let draftRepairRequested = false;
  let originalBigAnnounce = null;
  let originalUpdateUI = null;

  function stateNow() {
    return window.state || null;
  }

  function cleanWord(value) {
    return String(value || "").replace(/\s/g, "").toUpperCase();
  }

  function questVowelTarget(q) {
    const value = Number(q?.vowelTarget);
    return value >= 1 && value <= 3 ? value : 1;
  }

  function currentMatchKey(state) {
    return String(state?.matchId || state?.matchStartedAt || window.roomId || "");
  }

  function isVisible(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function scheduleUpdate() {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0;
      updateAll();
    });
  }

  function makeSvgUse(symbolId, className = "") {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    if (className) svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 120 120");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", `#${symbolId}`);
    svg.appendChild(use);
    return svg;
  }

  function formatCondition(condition) {
    if (typeof window.formatFieldReportCondition === "function") {
      const text = window.formatFieldReportCondition(condition);
      if (text) return text;
    }
    if (typeof condition === "string") return condition;
    if (!condition || typeof condition !== "object") return "Match the condition";

    const type = String(condition.type || condition.kind || "").toUpperCase();
    const value = condition.value ?? condition.letter ?? condition.count ?? "";
    const map = {
      STARTS_WITH: `Starts with ${value}`,
      ENDS_WITH: `Ends with ${value}`,
      CONTAINS: `Contains ${value}`,
      EXCLUDES: `Does not contain ${value}`,
      VOWELS_AT_LEAST: `At least ${value} vowels`,
      VOWELS_EXACTLY: `Exactly ${value} vowels`,
      UNIQUE_AT_LEAST: `At least ${value} different letters`,
      DOUBLE: "Contains a double letter"
    };
    return map[type] || String(condition.label || condition.text || "Match the condition");
  }

  function questInstruction(state) {
    const q = state?.powers?.quest;
    const type = q?.type;
    if (!type) return "";

    if (type === "RARE") {
      const letters = Array.isArray(q.rareLetters) && q.rareLetters.length
        ? q.rareLetters.map(cleanWord).join(" · ")
        : "Q · J · X · Z · W · K · V";
      return `Quest: Use 6 different rare letters — ${letters}`;
    }

    if (type === "FIELDREPORT") {
      const conditions = Array.isArray(q.conditions) ? q.conditions.map(formatCondition) : [];
      return conditions.length
        ? `Quest: Conditions → ${conditions.join(" · ")}`
        : "Quest: Match the three shown conditions";
    }

    if (type === "CHAIN") {
      const lastGuess = cleanWord((state.history || []).at(-1)?.guess);
      const letter = lastGuess.at(-1);
      return letter ? `Quest: Start your word with ${letter}` : "Quest: Start a word chain";
    }

    if (type === "VOWELSHORTAGE") {
      const target = questVowelTarget(q);
      return `Quest: Use exactly ${target} vowel${target === 1 ? "" : "s"}`;
    }

    const copy = {
      ROW: "Quest: Use every letter from one keyboard row",
      ALPHA: "Quest: Put all five letters in alphabetical order",
      DOUBLES: "Quest: Use a new doubled letter",
      HARDMODE: "Quest: Use every green and yellow clue already known",
      ALTERNATING: "Quest: Alternate consonants and vowels",
      BOOKENDS: "Quest: Use the same first and last letter",
      HALF_AM: "Quest: Use only letters A through P",
      HALF_NZ: "Quest: Use only letters K through Z"
    };
    return copy[type] || "Quest: Complete the shown challenge";
  }

  function ensureQuestRequirement() {
    return byId("guesserQuestRequirement");
  }

  function showQuestPraise(text) {
    const requirement = ensureQuestRequirement();
    const hud = byId("guesserQuestChargeHud");
    const host = !requirement?.classList.contains("hidden") ? requirement : hud;
    if (!host) return;

    let praise = byId("questPraiseV10");
    if (!praise) {
      praise = document.createElement("span");
      praise.id = "questPraiseV10";
      praise.className = "quest-praise-v10";
      host.appendChild(praise);
    } else if (praise.parentElement !== host) {
      host.appendChild(praise);
    }

    praise.textContent = text;
    praise.classList.remove("show");
    void praise.offsetWidth;
    praise.classList.add("show");
    clearTimeout(praise.__hideTimer);
    praise.__hideTimer = setTimeout(() => praise.classList.remove("show"), 1200);
  }

  function updateQuestRequirement(state) {
    const requirement = ensureQuestRequirement();
    if (!requirement) return;
    const q = state?.powers?.quest;
    const show = window.myRole === "guesser" && !!q?.type && !q.used;
    requirement.classList.toggle("hidden", !show);
    if (!show) return;

    const qualified = requirement.classList.contains("is-qualified");
    let copy = requirement.querySelector(".quest-requirement-line-v10");
    if (!copy) {
      copy = document.createElement("span");
      copy.className = "quest-requirement-line-v10";
      requirement.replaceChildren(copy);
    }
    copy.textContent = questInstruction(state);
    requirement.dataset.questType = q.type;

    const draftRow = byId("draftGuesser")?.__draftRows?.draft ||
      document.querySelector("#draftGuesser .history-row.guesser-draft");
    const complete = cleanWord(
      [...(draftRow?.querySelectorAll(".history-tile") || [])]
        .slice(0, 5)
        .map(tile => tile.textContent || "")
        .join("")
    ).length === 5;
    draftRow?.classList.toggle("quest-ready-electric-v10", complete && qualified);
  }

  function questSourceBadge() {
    return document.querySelector("#guesserPowerContainer .quest-badge-tile");
  }

  function openQuestAction(state) {
    const source = questSourceBadge();
    if (source?.isConnected) {
      source.click();
      return;
    }

    const q = state?.powers?.quest;
    const status = window.computeQuestStatus?.(state);
    if (!q?.type || !status) return;
    const canClaim = window.myRole === "guesser" &&
      state.turn === state.guesser &&
      !q.used &&
      (q.ready || q.oneAway);

    window.showPowerActionPopup?.({
      emoji: status.meta?.emoji || "⚡",
      title: status.meta?.label || "Quest",
      desc: status.desc || questInstruction(state),
      showUse: canClaim,
      useEnabled: canClaim,
      useLabel: q.ready ? "Claim green clue" : "Claim yellow clue",
      onUse: () => window.sendGameAction?.({ type: "USE_QUEST" })
    });
  }

  function ensureQuestMeterAction(state) {
    const hud = byId("guesserQuestChargeHud");
    const meter = byId("guesserQuestChargeMeter");
    const q = state?.powers?.quest;
    if (!hud || !meter || !q?.type) return;

    hud.classList.add("quest-meter-merged-v10");
    let button = byId("questMeterActionV10");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = "questMeterActionV10";
      button.className = "quest-meter-action-v10";
      button.addEventListener("click", event => {
        event.stopPropagation();
        openQuestAction(stateNow());
      });
      hud.insertBefore(button, meter);
    }

    const iconId = QUEST_ICONS[q.type] || "quest-field-report";
    const existingUse = button.querySelector("use")?.getAttribute("href");
    if (existingUse !== `#${iconId}`) {
      button.replaceChildren(makeSvgUse(iconId, "quest-meter-icon-v10"));
    }

    const yellow = !q.used && !q.ready && !!q.oneAway;
    const green = !q.used && !!q.ready;
    button.classList.toggle("is-yellow", yellow);
    button.classList.toggle("is-green", green);
    button.classList.toggle("is-done", !!q.used);
    button.title = green
      ? "Quest ready — claim the green clue"
      : yellow
        ? "Quest can be claimed early for a yellow clue"
        : q.used
          ? "Quest completed"
          : window.QUEST_METADATA?.[q.type]?.label || "Quest";
    button.setAttribute("aria-label", button.title);

    document.querySelectorAll("#guesserPowerContainer .quest-badge-tile").forEach(card => {
      card.closest(".power-btn-wrapper")?.classList.add("quest-card-merged-v10");
      card.classList.add("quest-card-merged-v10");
    });
  }

  function ensureQuestCollapsedAction(state) {
    const q = state?.powers?.quest;
    const screen = byId("guesserScreen");
    const dock = byId("guesserCollapsedActionDock");
    const show = window.myRole === "guesser" &&
      screen?.classList.contains("active") &&
      screen.classList.contains("guesser-sidebar-collapsed") &&
      !q?.used &&
      (q?.ready || q?.oneAway);

    let mini = byId("questCollapsedActionV10");
    if (!show || !dock) {
      mini?.remove();
      return;
    }

    if (!mini) {
      mini = document.createElement("button");
      mini.type = "button";
      mini.id = "questCollapsedActionV10";
      mini.className = "collapsed-action-mini quest-collapsed-action-v10";
      mini.addEventListener("click", event => {
        event.stopPropagation();
        openQuestAction(stateNow());
      });
      dock.prepend(mini);
    }

    const iconId = QUEST_ICONS[q.type] || "quest-field-report";
    const existingUse = mini.querySelector("use")?.getAttribute("href");
    if (existingUse !== `#${iconId}`) {
      mini.replaceChildren(makeSvgUse(iconId, "collapsed-action-quest-icon-v10"));
    }
    mini.classList.toggle("is-yellow", !!q.oneAway && !q.ready);
    mini.classList.toggle("is-green", !!q.ready);
    mini.title = q.ready ? "Claim Quest green clue" : "Claim Quest early yellow clue";
    mini.setAttribute("aria-label", mini.title);
    dock.classList.remove("is-empty", "hidden");
  }

  function updateQuestProgressPraise(state) {
    const q = state?.powers?.quest;
    const meter = byId("guesserQuestChargeMeter");
    if (!q?.type || !meter) return;
    const key = [currentMatchKey(state), state.roundIndex ?? "", state.guesser || "", q.type].join("|");
    const progress = Number(meter.getAttribute("aria-valuenow")) || 0;
    if (key !== lastQuestKey) {
      lastQuestKey = key;
      lastQuestProgress = progress;
      return;
    }
    if (lastQuestProgress != null && progress > lastQuestProgress) {
      const delta = progress - lastQuestProgress;
      showQuestPraise(q.ready ? "Ready" : delta > 1 ? "Well done" : "Nice");
    }
    lastQuestProgress = progress;
  }

  function clearSetterDraftDecorations() {
    const draft = byId("draftSetter");
    draft?.querySelectorAll(
      ".setter-cover-bonus-star, .setter-cover-target, .draft-hint-star, " +
      ".setter-draft-target-letter, .setter-target-corner-letter, [data-cover-bonus-star]"
    ).forEach(element => element.remove());

    const row = draft?.__draftRows?.draft || draft?.querySelector(".history-row.setter-draft, .history-row.ghost-secret");
    row?.querySelectorAll(".history-tile").forEach(tile => {
      tile.classList.remove(
        "setter-bonus-target-tile-v10",
        "is-correct",
        "draft-tile-hint-slot",
        "draft-tile-hint-slot-matched",
        "draft-tile-hint-slot-shake"
      );
      tile.removeAttribute("data-bonus-letter");
      tile.removeAttribute("data-target-letter");
    });
  }

  function ensureBonusTarget() {
    const stage = document.querySelector("#setterScreen .setter-decision-stage");
    const draftWrap = stage?.querySelector(".draft-row-wrap");
    if (!stage || !draftWrap) return null;
    let target = byId("setterBonusTargetV9");
    if (!target) {
      target = document.createElement("div");
      target.id = "setterBonusTargetV9";
      target.className = "setter-bonus-target-v9 hidden";
      stage.insertBefore(target, draftWrap);
    }
    return target;
  }

  function updateSetterBonusTarget(state) {
    // Power Choice mode has its own single canonical renderer for this
    // element and tile decoration (power-choice-mode.js's
    // normalizeBonusTarget) -- bail out instead of fighting it for the
    // same DOM node every render tick.
    if (document.body.classList.contains("power-choice-mode")) return;

    const target = ensureBonusTarget();
    if (!target) return;
    const matchKey = currentMatchKey(state);
    if (matchKey !== lastBonusMatchKey) {
      lastBonusMatchKey = matchKey;
      target.replaceChildren();
      target.classList.add("hidden");
      clearSetterDraftDecorations();
    }

    const charge = state?.powers?.spyCharge;
    const hint = charge?.hint;
    const show = window.myRole === "setter" &&
      charge?.enabled &&
      state?.phase === "normal" &&
      state.turn === state.setter &&
      !!state.pendingGuess &&
      !state.powers?.freezeActive &&
      !state.powers?.rouletteSecretActive &&
      !state.simultaneousAllWrong &&
      !!hint?.letter &&
      Number.isInteger(hint.position);

    target.classList.toggle("hidden", !show);
    clearSetterDraftDecorations();
    if (!show) {
      target.replaceChildren();
      return;
    }

    const letter = cleanWord(hint.letter).slice(0, 1);
    const position = hint.position + 1;
    const positionLabel =
      ["1st", "2nd", "3rd", "4th", "5th"][hint.position] || `${position}th`;
    const signature = `${letter}:${hint.position}`;
    if (
      target.dataset.signature !== signature ||
      !target.querySelector(".setter-bonus-position-v10")
    ) {
      target.dataset.signature = signature;
      target.innerHTML =
        `<span class="setter-bonus-plus-v10" aria-hidden="true">+★</span>` +
        `<span class="setter-bonus-position-v10"><strong>${letter}</strong> in ${positionLabel}</span>`;
    }
    target.setAttribute("aria-label", `Bonus star: ${letter} in ${positionLabel}`);
    // compact-bonus-hint-v1

    const row = byId("draftSetter")?.__draftRows?.draft ||
      document.querySelector("#draftSetter .history-row.setter-draft, #draftSetter .history-row.ghost-secret");
    const tile = row?.__tiles?.[hint.position] || row?.querySelectorAll(".history-tile")?.[hint.position];
    if (tile) {
      tile.classList.add("setter-bonus-target-tile-v10");
      const draft = cleanWord(state.setterDraft);
      tile.classList.toggle("is-correct", draft.length === 5 && draft[hint.position] === letter);
    }
  }

  function updateSpyChargeMeter() {
    byId("spyChargeHud")?.classList.add("spy-charge-hud-v10");
    byId("spyChargeMeter")?.classList.add("spy-charge-meter-v10");
  }

  function repairGuesserDraft(state) {
    if (window.myRole !== "guesser") return;
    const canGuess = !!state && !state.gameOver && (
      (state.phase === "simultaneous" && !state.simultaneousGuessSubmitted) ||
      (state.phase === "normal" && state.turn === state.guesser && !state.pendingGuess)
    );
    if (!canGuess) return;

    const container = byId("draftGuesser");
    const row = container?.__draftRows?.draft || container?.querySelector(".history-row.guesser-draft");
    if (row) {
      container.__guesserSubmitSlideDone = false;
      row.__slidingOut = false;
      row.classList.remove("row-slide-out", "guesser-draft-held", "guesser-submit-flying");
      row.style.display = "";
      draftRepairRequested = false;
      return;
    }

    if (!draftRepairRequested && typeof window.updateUI === "function") {
      draftRepairRequested = true;
      requestAnimationFrame(() => {
        try { window.updateUI(); } finally { draftRepairRequested = false; }
      });
    }
  }

  function isMyTurn(state) {
    if (!state || !window.myRole) return false;
    if (state.phase === "simultaneous") {
      return window.myRole === "setter"
        ? !state.simultaneousSecretSubmitted
        : !state.simultaneousGuessSubmitted;
    }
    if (state.phase === "normal") {
      const myId = window.currentUser?.id || state?.[window.myRole];
      return state.turn === myId;
    }
    return false;
  }

  function updateGuide(state) {
    const phase = byId("guidePhase");
    const task = byId("guideTask");
    if (!phase) return;
    phase.textContent = isMyTurn(state) ? "Your turn" : "Opponent's turn";
    if (task) task.textContent = "";
  }

  function enhanceAnnouncement() {
    const popup = byId("bigAnnouncePopup");
    if (!popup?.classList.contains("show")) return;
    const groups = popup.querySelectorAll(".big-announce-power-group");
    groups.forEach(group => {
      const label = group.querySelector(".big-announce-power-group-label");
      const roleId = label?.classList.contains("role-setter") ? "setter" : "guesser";
      const roleLabel = roleId === "setter" ? "SPY" : "INSPECTOR";
      const ownerLabel = roleId === window.myRole ? "YOU" : "OPPONENT";
      if (label) label.textContent = `${ownerLabel} · ${roleLabel}`;
      group.classList.toggle("is-you-v10", ownerLabel === "YOU");
      group.classList.toggle("is-opponent-v10", ownerLabel === "OPPONENT");
      group.querySelectorAll(".big-announce-power-row").forEach(row => {
        const title = row.querySelector("strong")?.textContent || "";
        row.classList.toggle("is-quest-v10", /^Quest:/i.test(title));
      });
    });
    popup.classList.toggle("has-power-groups-v10", groups.length > 0);
  }

  function wrapBigAnnounce() {
    if (!window.showBigAnnounce || window.showBigAnnounce.__v10Wrapped) return;
    originalBigAnnounce = window.showBigAnnounce;
    const wrapped = function (options = {}) {
      const result = originalBigAnnounce(options);
      requestAnimationFrame(enhanceAnnouncement);
      return result;
    };
    wrapped.__v10Wrapped = true;
    window.showBigAnnounce = wrapped;
  }

  function moveSpyPraise() {
    document.querySelectorAll(".spy-charge-congrats:not(.meter-praise-v10)").forEach(praise => {
      const host = byId("setterCoverStars") || byId("setterBonusTargetV9") || byId("spyChargeHud");
      if (!host) return;
      praise.classList.add("meter-praise-v10");
      host.appendChild(praise);
      praise.style.left = "";
      praise.style.top = "";
    });
  }

  function fixPowerCardSizing() {
    document.querySelectorAll("#guesserPowerContainer .power-btn.power-badge").forEach(button => {
      const id = button.dataset.powerId || "";
      if (id === "letterProbe" || /letter scan/i.test(button.textContent || "")) {
        button.classList.add("letter-scan-card-v10");
      }
      if (id === "letterProfile" || button.classList.contains("letter-profile-tile")) {
        button.classList.add("letter-profile-card-v10");
      }
    });
  }

  function updateAll() {
    if (updating) return;
    updating = true;
    try {
      const state = stateNow();
      wrapBigAnnounce();
      if (state) {
        updateQuestRequirement(state);
        ensureQuestMeterAction(state);
        ensureQuestCollapsedAction(state);
        updateQuestProgressPraise(state);
        updateSetterBonusTarget(state);
        repairGuesserDraft(state);
        updateGuide(state);
      }
      updateSpyChargeMeter();
      enhanceAnnouncement();
      moveSpyPraise();
      fixPowerCardSizing();
    } finally {
      updating = false;
    }
  }

  function wrapUpdater(name) {
    const original = window[name];
    if (typeof original !== "function" || original.__v10Wrapped) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      scheduleUpdate();
      return result;
    };
    wrapped.__v10Wrapped = true;
    window[name] = wrapped;
  }

  function installHooks() {
    wrapUpdater("updateQuestChargeV9");
    wrapUpdater("updateSpyChargeUI");
    wrapUpdater("updateUI");
    wrapBigAnnounce();
  }

  function init() {
    installHooks();
    updateAll();

    const observer = new MutationObserver(scheduleUpdate);
    for (const element of [
      byId("setterScreen"),
      byId("guesserScreen"),
      byId("guesserQuestChargeHud"),
      byId("setterCoverStars"),
      byId("bigAnnouncePopup")
    ]) {
      if (!element) continue;
      observer.observe(element, {
        attributes: true,
        attributeFilter: ["class", "aria-valuenow"],
        childList: true,
        subtree: true
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleUpdate();
    });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    setInterval(() => {
      installHooks();
      scheduleUpdate();
    }, 700);
  }

  window.updateGameplaySystemsV10 = scheduleUpdate;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
