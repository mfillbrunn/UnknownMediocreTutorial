(() => {
  "use strict";

  // competitive-wordle-fixes-v2
  const RUNTIME_ID = "competitive-wordle-fixes-v2.2";
  if (window.__competitiveWordleFixesV2 === RUNTIME_ID) return;
  window.__competitiveWordleFixesV2 = RUNTIME_ID;

  const byId = id => document.getElementById(id);
  let updateFrame = 0;
  let compatibilityObserver = null;

  function setAttributeIfChanged(element, name, value) {
    if (!element) return;
    const next = String(value);
    if (element.getAttribute(name) !== next) element.setAttribute(name, next);
  }

  function removeAttributeIfPresent(element, name) {
    if (element?.hasAttribute(name)) element.removeAttribute(name);
  }

  function cleanLetter(value) {
    return String(value || "")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 1);
  }

  function stateNow() {
    return window.state || null;
  }

  function formatFieldReportCondition(condition) {
    if (typeof window.formatFieldReportCondition === "function") {
      try {
        const formatted = window.formatFieldReportCondition(condition);
        if (formatted) return String(formatted);
      } catch {}
    }

    if (typeof condition === "string") return condition;
    if (!condition || typeof condition !== "object") return "Match the condition";

    const type = String(condition.type || condition.kind || "");
    const letter = cleanLetter(condition.letter ?? condition.value);
    const count = Number(condition.count ?? condition.value);
    const plural = count === 1 ? "vowel" : "vowels";

    switch (type) {
      case "startsWith":
      case "STARTS_WITH":
      case "STARTSWITH":
        return letter ? `Start with ${letter}` : "Match the starting-letter rule";
      case "endsWith":
      case "ENDS_WITH":
      case "ENDSWITH":
        return letter ? `End with ${letter}` : "Match the ending-letter rule";
      case "doubleLetter":
      case "DOUBLE":
      case "DOUBLELETTER":
        return letter ? `Use double ${letter}` : "Use a double letter";
      case "minVowels":
      case "VOWELS_AT_LEAST":
      case "MINVOWELS":
        return Number.isFinite(count) ? `At least ${count} ${plural}` : "Meet the minimum-vowel rule";
      case "maxVowels":
      case "VOWELS_AT_MOST":
      case "MAXVOWELS":
        return Number.isFinite(count) ? `At most ${count} ${plural}` : "Meet the maximum-vowel rule";
      case "firstLastSame":
      case "FIRSTLASTSAME":
      case "BOOKENDS":
        return "Same first and last letter";
      case "palindrome":
      case "PALINDROME":
        return "Make a palindrome";
      default:
        return String(condition.label || condition.text || "Match the condition");
    }
  }

  function safeQuestStatus(state) {
    try {
      return window.computeQuestStatus?.(state) || null;
    } catch {
      return null;
    }
  }

  function fieldReportProgressLabel(quest, state) {
    const raw = String(safeQuestStatus(state)?.label || "").trim();
    if (/^\d+\s*\/\s*8$/.test(raw)) return raw.replace(/\s+/g, "");
    if (quest?.ready) return "8/8";
    return "";
  }

  function fieldReportInstruction(quest, state = stateNow(), expanded = false) {
    const conditions = Array.isArray(quest?.conditions)
      ? quest.conditions.map(formatFieldReportCondition).filter(Boolean)
      : [];
    const progress = fieldReportProgressLabel(quest, state);
    const progressCopy = progress
      ? expanded
        ? ` Current progress: ${progress}.`
        : ` ${progress}.`
      : "";
    const rules = conditions.length
      ? `${expanded ? " Current rules" : " Rules"}: ${conditions.join(" · ")}.`
      : "";

    if (expanded) {
      return (
        "Each submitted guess is checked against the three current Field Report rules. " +
        "Every matched rule adds 1 point, so one word can add 0–3 points. " +
        "At 6 points you may claim a yellow clue early; at 8 points you may claim a green clue. " +
        "The three rules refresh after every submitted guess." +
        progressCopy +
        rules
      );
    }

    return (
      "Field Report" +
      progressCopy +
      " Each matched rule adds +1. Claim yellow at 6 or green at 8; rules refresh after each guess." +
      rules
    );
  }

  function showFieldReportRules(state, quest) {
    const status = safeQuestStatus(state);
    const isMyTurn = state?.turn === state?.guesser;
    const eligible = !!(quest?.ready || quest?.oneAway);
    const canClaim = !!(
      window.myRole === "guesser" &&
      isMyTurn &&
      !quest?.used &&
      eligible
    );
    let description = fieldReportInstruction(quest, state, true);

    if (quest?.oneAway && !quest?.ready) {
      description += " Claiming now gives the yellow clue; continuing to 8 preserves the green-clue reward.";
    }
    if (eligible && !isMyTurn) {
      description += " The claim button becomes available on your turn.";
    }

    window.showPowerActionPopup?.({
      emoji: status?.meta?.emoji || "🎯",
      title: status?.meta?.label || "Field Report",
      desc: description,
      showUse: canClaim,
      useEnabled: canClaim,
      useLabel: quest?.ready ? "Claim green clue" : "Claim yellow clue",
      onUse: canClaim
        ? () => window.sendGameAction?.({
            type: "USE_QUEST",
            userId: window.currentUser?.id
          })
        : undefined
    });
  }

  function openQuestRules() {
    const requirement = byId("guesserQuestRequirement");
    if (!requirement || requirement.classList.contains("hidden")) return;

    const state = stateNow();
    const quest = state?.powers?.quest;
    if (!quest?.type || quest.used || window.myRole !== "guesser") return;

    if (quest.type === "FIELDREPORT") {
      showFieldReportRules(state, quest);
      return;
    }

    const source = document.querySelector("#guesserPowerContainer .quest-badge-tile");
    if (source?.isConnected && typeof source.click === "function") {
      source.click();
      return;
    }

    const status = safeQuestStatus(state);
    const metadata = window.QUEST_METADATA?.[quest.type] || {};
    const canClaim = !!(
      state.turn === state.guesser &&
      (quest.ready || quest.oneAway)
    );
    const description = status?.desc || metadata.desc || "Complete the shown Quest requirement.";

    window.showPowerActionPopup?.({
      emoji: status?.meta?.emoji || metadata.emoji || "⚡",
      title: status?.meta?.label || metadata.label || "Quest rules",
      desc: description,
      showUse: canClaim,
      useEnabled: canClaim,
      useLabel: quest.ready ? "Claim green clue" : "Claim yellow clue",
      onUse: canClaim
        ? () => window.sendGameAction?.({
            type: "USE_QUEST",
            userId: window.currentUser?.id
          })
        : undefined
    });
  }

  function cleanupInactiveRequirement(requirement) {
    requirement.classList.remove("quest-rules-trigger-v2", "quest-rules-field-report-v2");
    removeAttributeIfPresent(requirement, "tabindex");
    removeAttributeIfPresent(requirement, "role");
    removeAttributeIfPresent(requirement, "aria-haspopup");
    removeAttributeIfPresent(requirement, "aria-label");
    removeAttributeIfPresent(requirement, "title");
    requirement.querySelector(".quest-rules-affordance-v2")?.remove();
    requirement
      .querySelector(".quest-requirement-line-v10")
      ?.removeAttribute("data-rule-copy-v2");
  }

  function bindQuestRequirement() {
    const requirement = byId("guesserQuestRequirement");
    const state = stateNow();
    const quest = state?.powers?.quest;
    const active = !!(window.myRole === "guesser" && quest?.type && !quest.used);
    const fieldReportActive = !!(active && quest.type === "FIELDREPORT");

    const infoBar = byId("questInfoBar");
    if (infoBar) {
      infoBar.classList.toggle("quest-info-hidden-v2", fieldReportActive);
      if (fieldReportActive) {
        setAttributeIfChanged(infoBar, "aria-hidden", "true");
      } else {
        removeAttributeIfPresent(infoBar, "aria-hidden");
      }
    }

    // Clean up the class used by an earlier draft of this installer. The
    // charge meter itself remains available; only the direct Field Report
    // bar above the draft is removed.
    const hud = byId("guesserQuestChargeHud");
    if (hud) {
      hud.classList.remove("quest-meter-hidden-v2");
      removeAttributeIfPresent(hud, "aria-hidden");
    }

    if (!requirement) return;
    if (!fieldReportActive) {
      cleanupInactiveRequirement(requirement);
      return;
    }

    requirement.classList.add("quest-rules-trigger-v2", "quest-rules-field-report-v2");

    let copy = requirement.querySelector(".quest-requirement-line-v10");
    if (!copy) {
      copy = document.createElement("span");
      copy.className = "quest-requirement-line-v10";
      requirement.replaceChildren(copy);
    }

    const questLabel = window.QUEST_METADATA?.[quest.type]?.label || "Field Report";
    const accessibleRules = fieldReportInstruction(quest, state, false) || questLabel;
    // Keep the base script's real text untouched so its own MutationObserver
    // does not fight this override frame-by-frame. CSS displays this data
    // attribute instead; the parent aria-label supplies the accessible copy.
    setAttributeIfChanged(copy, "data-rule-copy-v2", accessibleRules);

    let affordance = requirement.querySelector(".quest-rules-affordance-v2");
    if (!affordance) {
      affordance = document.createElement("span");
      affordance.className = "quest-rules-affordance-v2";
      affordance.setAttribute("aria-hidden", "true");
      affordance.textContent = "Rules";
      requirement.appendChild(affordance);
    }

    setAttributeIfChanged(requirement, "role", "button");
    setAttributeIfChanged(requirement, "aria-haspopup", "dialog");
    if (requirement.tabIndex !== 0) requirement.tabIndex = 0;

    const punctuation = /[.!?]$/.test(accessibleRules) ? "" : ".";
    setAttributeIfChanged(
      requirement,
      "aria-label",
      `${accessibleRules}${punctuation} Activate to open rules and claim options.`
    );
    setAttributeIfChanged(requirement, "title", `Open ${questLabel} rules and claim options`);

    if (requirement.dataset.questRulesBoundV2 !== "1") {
      requirement.dataset.questRulesBoundV2 = "1";
      requirement.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openQuestRules();
      });
      requirement.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        openQuestRules();
      });
    }
  }

  function disableAwardBackdrop() {
    const backdrop = byId("spyChargeAwardBackdrop");
    if (!backdrop) return;
    if (!backdrop.hidden) backdrop.hidden = true;
    backdrop.classList.remove("show");
    setAttributeIfChanged(backdrop, "aria-hidden", "true");
  }

  function syncAll() {
    updateFrame = 0;
    compatibilityObserver?.disconnect();
    try {
      bindQuestRequirement();
      disableAwardBackdrop();
    } finally {
      connectCompetitiveObserver();
    }
  }

  function scheduleSync() {
    if (updateFrame || document.hidden) return;
    updateFrame = requestAnimationFrame(syncAll);
  }

  const COMPETITIVE_OBSERVER_OPTIONS = {
    attributes: true,
    attributeFilter: [
      "class",
      "aria-valuenow",
      "data-quest-type"
    ],
    childList: true,
    subtree: true
  };

  function connectCompetitiveObserver() {
    if (!compatibilityObserver) return;
    compatibilityObserver.disconnect();
    if (document.hidden) return;

    [
      byId("draftSetter"),
      byId("questInfoBar"),
      byId("guesserQuestRequirement"),
      byId("guesserQuestChargeHud"),
      byId("spyChargeAwardBackdrop")
    ]
      .filter(Boolean)
      .forEach(element => {
        compatibilityObserver.observe(
          element,
          COMPETITIVE_OBSERVER_OPTIONS
        );
      });
  }

  function installObservers() {
    if (!compatibilityObserver) {
      compatibilityObserver = new MutationObserver(
        scheduleSync
      );
    }
    connectCompetitiveObserver();
  }

  function init() {
    installObservers();
    syncAll();

    try {
      socket.on("stateUpdate", scheduleSync);
    } catch {}

    window.addEventListener(
      "resize",
      scheduleSync,
      { passive: true }
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          compatibilityObserver?.disconnect();
          return;
        }
        connectCompetitiveObserver();
        scheduleSync();
      }
    );
  }

  window.updateCompetitiveWordleFixesV2 = scheduleSync;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
