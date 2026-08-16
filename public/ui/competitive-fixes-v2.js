(() => {
  "use strict";

  // competitive-wordle-fixes-v2
  const RUNTIME_ID = "competitive-wordle-fixes-v2.2";
  if (window.__competitiveWordleFixesV2 === RUNTIME_ID) return;
  window.__competitiveWordleFixesV2 = RUNTIME_ID;

  const byId = id => document.getElementById(id);
  let updateFrame = 0;

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

  function ordinal(position) {
    return ["1st", "2nd", "3rd", "4th", "5th"][position - 1] || `${position}th`;
  }

  function stateNow() {
    return window.state || null;
  }

  function ensureBonusTarget() {
    let target = byId("setterBonusTargetV9");
    if (target) return target;

    const stage = document.querySelector("#setterScreen .setter-decision-stage");
    const draftWrap = stage?.querySelector(".draft-row-wrap");
    if (!stage || !draftWrap) return null;

    target = document.createElement("div");
    target.id = "setterBonusTargetV9";
    target.className = "setter-bonus-target-v9 hidden";
    stage.insertBefore(target, draftWrap);
    return target;
  }

  function bonusIsVisible(state, charge, hint) {
    return !!(
      state &&
      window.myRole === "setter" &&
      charge?.enabled &&
      state.phase === "normal" &&
      state.turn === state.setter &&
      state.pendingGuess &&
      !state.powers?.freezeActive &&
      !state.powers?.rouletteSecretActive &&
      !state.simultaneousAllWrong &&
      cleanLetter(hint?.letter) &&
      Number.isInteger(hint?.position) &&
      hint.position >= 0 &&
      hint.position < 5
    );
  }

  function writeBonusMarkup(target, letter, positionLabel, signature) {
    const currentLetter = target.querySelector(".setter-bonus-letter-chip-v2")?.textContent;
    const currentCopy = target.querySelector(".setter-bonus-position-copy-v2")?.textContent;
    const complete =
      target.dataset.competitiveFixSignature === signature &&
      currentLetter === letter &&
      currentCopy === `in ${positionLabel}`;

    if (!complete) {
      const plus = document.createElement("span");
      plus.className = "setter-bonus-plus-v10";
      plus.setAttribute("aria-hidden", "true");
      plus.textContent = "+★";

      const position = document.createElement("span");
      position.className = "setter-bonus-position-v10";

      const letterChip = document.createElement("strong");
      letterChip.className = "setter-bonus-letter-chip-v2";
      letterChip.textContent = letter;

      const copy = document.createElement("span");
      copy.className = "setter-bonus-position-copy-v2";
      copy.textContent = `in ${positionLabel}`;

      position.append(letterChip, copy);
      target.replaceChildren(plus, position);
    }

    target.classList.add("competitive-bonus-target-v2");
    if (target.dataset.signature !== signature) target.dataset.signature = signature;
    if (target.dataset.competitiveFixSignature !== signature) {
      target.dataset.competitiveFixSignature = signature;
    }
    setAttributeIfChanged(target, "aria-label", `Bonus star: ${letter} in ${positionLabel}`);
  }

  function setterDraftTiles() {
    const draft = byId("draftSetter");
    const row = draft?.__draftRows?.draft ||
      draft?.querySelector(".history-row.setter-draft, .history-row.ghost-secret");
    if (!row) return [];
    if (Array.isArray(row.__tiles)) return row.__tiles;
    if (row.__tiles && typeof row.__tiles.length === "number") return [...row.__tiles];
    return [...row.querySelectorAll(".history-tile")].slice(0, 5);
  }

  function syncCornerBadge(targetTile, letter) {
    document
      .querySelectorAll("#draftSetter .setter-target-corner-letter-v2")
      .forEach(badge => {
        if (badge.parentElement !== targetTile) badge.remove();
      });

    if (!targetTile || !letter) return;

    let badge = [...targetTile.children]
      .find(child => child.classList?.contains("setter-target-corner-letter-v2"));
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "setter-target-corner-letter-v2";
      badge.setAttribute("aria-hidden", "true");
      targetTile.appendChild(badge);
    }
    setAttributeIfChanged(badge, "data-letter", letter);
  }

  function syncBonusTarget() {
    const state = stateNow();
    const charge = state?.powers?.spyCharge;
    const hint = charge?.hint;
    const target = ensureBonusTarget();
    const show = bonusIsVisible(state, charge, hint);
    const tiles = setterDraftTiles();

    tiles.forEach((tile, index) => {
      tile.classList.toggle(
        "setter-bonus-target-tile-v2",
        !!(show && index === hint?.position)
      );
    });

    if (target) target.classList.toggle("hidden", !show);
    if (!show || !target) {
      syncCornerBadge(null, "");
      return;
    }

    const letter = cleanLetter(hint.letter);
    const position = hint.position + 1;
    const positionLabel = ordinal(position);
    const signature = `${letter}:${hint.position}`;
    writeBonusMarkup(target, letter, positionLabel, signature);

    const tile = tiles[hint.position] || null;
    syncCornerBadge(tile, letter);
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
    syncBonusTarget();
    bindQuestRequirement();
    disableAwardBackdrop();
  }

  function scheduleSync() {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(syncAll);
  }

  function installObservers() {
    const observer = new MutationObserver(scheduleSync);
    for (const element of [
      byId("setterScreen"),
      byId("guesserScreen"),
      byId("questInfoBar"),
      byId("guesserQuestRequirement"),
      byId("guesserQuestChargeHud"),
      byId("setterBonusTargetV9"),
      byId("spyChargeAwardBackdrop")
    ]) {
      if (!element) continue;
      observer.observe(element, {
        attributes: true,
        attributeFilter: ["class", "aria-valuenow", "data-quest-type"],
        childList: true,
        subtree: true
      });
    }
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function init() {
    syncAll();
    installObservers();
    setInterval(scheduleSync, 700);
    window.addEventListener("resize", scheduleSync, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleSync();
    });
  }

  window.updateCompetitiveWordleFixesV2 = scheduleSync;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
