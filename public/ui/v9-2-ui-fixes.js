(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const toastTimers = new Map();
  let layoutFrame = 0;
  let bonusFrame = 0;
  let questFrame = 0;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function isDrawerCollapsed(role) {
    const screen = byId(role === "setter" ? "setterScreen" : "guesserScreen");
    return !!screen?.classList.contains(
      role === "setter"
        ? "setter-sidebar-collapsed"
        : "guesser-sidebar-collapsed"
    );
  }

  function toneFor(role, value, max, explicitTone) {
    if (explicitTone) return explicitTone;

    if (role === "setter") {
      if (value >= 12) return "purple";
      if (value >= 8) return "cyan";
      if (value >= 5) return "yellow";
      return "blue";
    }

    if (max > 0 && value >= max) return "green";
    if (max > 1 && value >= max - 1) return "yellow";
    return "blue";
  }

  function ensureCollapsedMeter(role) {
    const screen = byId(role === "setter" ? "setterScreen" : "guesserScreen");
    if (!screen) return null;

    const id = `${role}CollapsedChargeToast`;
    let toast = byId(id);

    if (!toast) {
      toast = document.createElement("div");
      toast.id = id;
      toast.className = `collapsed-charge-toast collapsed-charge-toast-${role}`;
      toast.setAttribute("aria-live", "polite");
      screen.appendChild(toast);
    }

    toast.classList.add("collapsed-charge-meter-v92");
    return toast;
  }

  /*
   * Replaces the old number-only popup with a real miniature meter.
   * quest-charge-v9.js uses the returned element as the animation target,
   * so energy now visibly lands in the temporary meter while the drawer is
   * closed. The same popup is used for the Spy's star charge.
   */
  window.showCollapsedChargeToast = function (role, detail = {}) {
    const toast = ensureCollapsedMeter(role);
    if (!toast) return null;

    clearTimeout(toastTimers.get(role));

    const max = Math.max(1, Number(detail.max) || (role === "setter" ? 12 : 1));
    const value = clamp(Number(detail.value) || 0, 0, max);
    const delta = Math.max(0, Number(detail.delta) || 0);
    const tone = toneFor(role, value, max, detail.tone);

    toast.dataset.tone = tone;
    toast.style.setProperty("--collapsed-meter-segments", String(max));

    const segments = Array.from({ length: max }, (_, index) => {
      const classes = ["collapsed-meter-segment-v92"];
      if (index < value) classes.push("is-filled");
      if (role === "setter" && [4, 7, 11].includes(index)) {
        classes.push("is-milestone");
      }
      return `<span class="${classes.join(" ")}"></span>`;
    }).join("");

    toast.innerHTML = `
      <span class="collapsed-meter-track-v92" aria-hidden="true">${segments}</span>
      <span class="collapsed-meter-value-v92">${value}/${max}</span>
      ${delta ? `<span class="collapsed-charge-toast-delta">+${delta}</span>` : ""}
    `;

    toast.setAttribute(
      "aria-label",
      `${role === "setter" ? "Spy charge" : "Quest charge"}: ${value} of ${max}`
    );

    toast.classList.add("show");

    const timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2500);

    toastTimers.set(role, timer);
    return toast;
  };

  function installImmediateSetterMeter() {
    if (typeof socket === "undefined" || !socket || typeof socket.on !== "function") {
      return;
    }

    socket.on("spyChargeAward", payload => {
      if (!isDrawerCollapsed("setter")) return;

      const before = clamp(Number(payload?.before) || 0, 0, 12);
      const delta = Math.max(
        0,
        (Number(payload?.appliedBaseStars) || 0) +
          (Number(payload?.appliedBonusStars) || 0)
      );

      window.showCollapsedChargeToast("setter", {
        value: before,
        max: 12,
        delta,
        tone: toneFor("setter", before, 12)
      });
    });
  }

  function formatFieldCondition(condition) {
    const letter = String(condition?.letter || "").toUpperCase();

    switch (condition?.type) {
      case "startsWith":
        return `Start ${letter}`;
      case "endsWith":
        return `End ${letter}`;
      case "doubleLetter":
        return `Use ${letter}${letter}`;
      case "minVowels":
        return `${Number(condition.count) || 0}+ vowels`;
      case "maxVowels":
        return `≤${Number(condition.count) || 0} vowels`;
      case "firstLastSame":
        return "Same first + last";
      case "palindrome":
        return "Reads both ways";
      default:
        return "Match the rule";
    }
  }

  function questInstruction(state = window.state) {
    const quest = state?.powers?.quest;
    const type = quest?.type;
    if (!type) return "";

    const snapshot = window.getQuestChargeV9?.(state);
    const rare = Array.isArray(quest.rareLetters) && quest.rareLetters.length
      ? quest.rareLetters.map(value => String(value).toUpperCase())
      : "QJXZWKV".split("");

    switch (type) {
      case "RARE":
        return `Use ${snapshot?.max || 6} different rare letters: ${rare.join(" ")}`;
      case "FIELDREPORT": {
        const conditions = Array.isArray(quest.conditions) ? quest.conditions : [];
        return conditions.length
          ? `Match these rules: ${conditions.map(formatFieldCondition).join(" · ")}`
          : "Match the Field Report rules";
      }
      case "CHAIN": {
        const needed = snapshot?.nextLetter || "";
        return needed ? `Start this word with ${needed}` : "Submit any word to start the chain";
      }
      case "ROW":
        return `Complete the ${snapshot?.row?.label || "closest"} keyboard row`;
      case "ALPHA":
        return "Put all letters in A→Z or Z→A order";
      case "DOUBLES":
        return "Use a new double letter";
      case "HARDMODE":
        return "Use every green and yellow clue";
      case "ALTERNATING":
        return "Alternate consonant and vowel";
      case "BOOKENDS":
        return "Use the same first and last letter";
      case "HALF_AM":
        return "Use only letters A through P";
      case "HALF_NZ":
        return "Use only letters K through Z";
      case "VOWELSHORTAGE":
        return "Use exactly one vowel";
      default:
        return window.QUEST_METADATA?.[type]?.desc || "Complete the Quest";
    }
  }

  function compactQuestRequirement() {
    const requirement = byId("guesserQuestRequirement");
    if (!requirement || requirement.classList.contains("hidden")) return;

    const instruction = questInstruction(window.state);
    if (!instruction) return;

    if (
      requirement.dataset.compactInstructionV92 === instruction &&
      requirement.querySelector(":scope > .quest-requirement-inline-v92")
    ) {
      return;
    }

    requirement.dataset.compactInstructionV92 = instruction;
    requirement.replaceChildren();

    const line = document.createElement("div");
    line.className = "quest-requirement-inline-v92";
    line.textContent = instruction;
    requirement.appendChild(line);
  }

  function scheduleQuestCompact() {
    if (questFrame) return;
    questFrame = requestAnimationFrame(() => {
      questFrame = 0;
      compactQuestRequirement();
    });
  }

  function observeQuestRequirement() {
    const requirement = byId("guesserQuestRequirement");
    if (!requirement || requirement.__compactV92Observed) return;

    requirement.__compactV92Observed = true;
    const observer = new MutationObserver(scheduleQuestCompact);
    observer.observe(requirement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    scheduleQuestCompact();
  }

  function bonusHint(state = window.state) {
    const charge = state?.powers?.spyCharge;
    const hint = charge?.hint;

    if (
      window.myRole !== "setter" ||
      !charge?.enabled ||
      !hint?.letter ||
      !Number.isInteger(hint.position)
    ) {
      return null;
    }

    return {
      letter: String(hint.letter).toUpperCase(),
      position: hint.position
    };
  }

  function normalizeBonusPanel(state = window.state) {
    const target = byId("setterBonusTargetV9");
    const hint = bonusHint(state);

    if (!target || !hint) return;

    const key = `${hint.letter}:${hint.position}`;
    if (
      target.dataset.compactBonusV92 === key &&
      target.querySelector(".setter-bonus-code-v92")
    ) {
      return;
    }

    target.dataset.compactBonusV92 = key;

    const boxes = Array.from({ length: 5 }, (_, index) => {
      const active = index === hint.position;
      return `<span class="setter-bonus-box-v9${active ? " is-target" : ""}">${active ? hint.letter : ""}</span>`;
    }).join("");

    target.innerHTML = `
      <span class="setter-bonus-code-v92">${hint.letter}${hint.position + 1}</span>
      <span class="setter-bonus-boxes-v9" aria-hidden="true">${boxes}</span>
    `;

    target.setAttribute(
      "aria-label",
      `Put ${hint.letter} in box ${hint.position + 1} for the bonus star`
    );
  }

  function applyBonusTile(state = window.state) {
    const hint = bonusHint(state);
    const rows = [...document.querySelectorAll(
      "#draftSetter .history-row.setter-draft, #draftSetter .history-row.ghost-secret"
    )].filter(row => row.style.display !== "none");

    document
      .querySelectorAll("#draftSetter .setter-bonus-tile-v92")
      .forEach(tile => {
        tile.classList.remove("setter-bonus-tile-v92");
        delete tile.dataset.bonusLetterV92;
      });

    document
      .querySelectorAll("#draftSetter .history-row.setter-bonus-row-v92")
      .forEach(row => {
        row.classList.remove("setter-bonus-row-v92");
        row.style.removeProperty("--setter-bonus-letter-v92");
        row.style.removeProperty("--setter-bonus-label-left-v92");
      });

    /* Remove labels left by an earlier V9.2 prerelease, if present. */
    document
      .querySelectorAll("#draftSetter .setter-bonus-corner-v92")
      .forEach(label => label.remove());

    if (!hint || !rows.length) return;

    const row = rows.at(-1);
    const tiles = row.__tiles || row.querySelectorAll(":scope > .history-tile");
    const tile = tiles?.[hint.position];
    if (!tile) return;

    tile.classList.add("setter-bonus-tile-v92");
    tile.dataset.bonusLetterV92 = hint.letter;

    /*
     * Put the large corner letter on the row pseudo-element rather than
     * inside the tile. That keeps tile.textContent equal to the real draft
     * letter, which is important for drag/lock input and draft validation.
     */
    row.classList.add("setter-bonus-row-v92");
    row.style.setProperty(
      "--setter-bonus-letter-v92",
      `"${hint.letter}"`
    );
    row.style.setProperty(
      "--setter-bonus-label-left-v92",
      `${tile.offsetLeft + tile.offsetWidth}px`
    );
  }

  function updateBonusUI(state = window.state) {
    // Power Choice mode has its own single canonical renderer for this
    // element and tile decoration (power-choice-mode.js's
    // normalizeBonusTarget) -- bail out instead of fighting it for the
    // same DOM node every render tick.
    if (document.body.classList.contains("power-choice-mode")) return;

    normalizeBonusPanel(state);
    applyBonusTile(state);
  }

  function scheduleBonusUI() {
    if (bonusFrame) return;
    bonusFrame = requestAnimationFrame(() => {
      bonusFrame = 0;
      updateBonusUI(window.state);
    });
  }

  function wrapSpyChargeUpdate() {
    const original = window.updateSpyChargeUI;
    if (typeof original !== "function" || original.__v92Wrapped) return;

    const wrapped = function (state, role) {
      original(state, role);
      scheduleBonusUI();
    };

    wrapped.__v92Wrapped = true;
    window.updateSpyChargeUI = wrapped;
  }

  function readySources(role) {
    const container = byId(role === "setter" ? "setterPowerContainer" : "guesserPowerContainer");
    if (!container) return [];

    return [...container.querySelectorAll(".power-btn.power-badge")].filter(button => {
      if (button.closest(".spy-charge-power-locked")) return false;
      if (button.classList.contains("power-used")) return false;
      if (button.classList.contains("disabled-btn")) return false;
      if (button.hidden || button.offsetParent === null) return false;

      if (button.classList.contains("quest-badge-tile")) {
        return button.classList.contains("quest-ready") || button.classList.contains("quest-oneaway");
      }

      return !button.disabled;
    });
  }

  function sourceForMini(role, mini) {
    if (mini.classList.contains("collapsed-reset-mini")) {
      return byId("spyChargeActionBtn");
    }

    const index = Number(mini.dataset.sourceIndex);
    if (!Number.isInteger(index)) return null;
    return readySources(role)[index] || null;
  }

  function alignDock(role) {
    const screen = byId(role === "setter" ? "setterScreen" : "guesserScreen");
    const dock = byId(role === "setter" ? "setterCollapsedActionDock" : "guesserCollapsedActionDock");
    if (!screen || !dock || dock.classList.contains("hidden")) return;

    const screenRect = screen.getBoundingClientRect();
    if (!screenRect.height) return;

    dock.classList.add("v92-source-aligned");

    [...dock.querySelectorAll(".collapsed-action-mini")].forEach((mini, index) => {
      const source = sourceForMini(role, mini);
      const sourceRect = source?.getBoundingClientRect?.();
      const fallbackTop = 104 + index * 50;
      const centerY = sourceRect?.height
        ? sourceRect.top - screenRect.top + sourceRect.height / 2
        : fallbackTop;

      const top = clamp(centerY - 21, 54, Math.max(54, screenRect.height - 52));
      mini.style.setProperty("--collapsed-action-top-v92", `${Math.round(top)}px`);
    });
  }

  function alignCollapsedDocks() {
    alignDock("setter");
    alignDock("guesser");
  }

  function scheduleDockLayout() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      alignCollapsedDocks();
      stripNotesCount();
    });
  }

  function stripNotesCount() {
    byId("setterNotesQuickCountV9")?.remove();
    document
      .querySelectorAll(".setter-notes-quick-count")
      .forEach(element => element.remove());
  }

  function installObservers() {
    const draftSetter = byId("draftSetter");
    if (draftSetter && !draftSetter.__v92BonusObserved) {
      draftSetter.__v92BonusObserved = true;
      const observer = new MutationObserver(scheduleBonusUI);
      observer.observe(draftSetter, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    }

    for (const id of [
      "setterCollapsedActionDock",
      "guesserCollapsedActionDock",
      "setterPowerContainer",
      "guesserPowerContainer",
      "setterScreen",
      "guesserScreen"
    ]) {
      const element = byId(id);
      if (!element || element.__v92LayoutObserved) continue;
      element.__v92LayoutObserved = true;

      const observer = new MutationObserver(scheduleDockLayout);
      observer.observe(element, {
        childList: true,
        subtree: id.includes("ActionDock") || id.includes("PowerContainer"),
        attributes: true,
        attributeFilter: ["class", "disabled", "hidden", "style"]
      });
    }

    const bodyObserver = new MutationObserver(() => {
      observeQuestRequirement();
      scheduleDockLayout();
      stripNotesCount();
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    installImmediateSetterMeter();
    wrapSpyChargeUpdate();
    observeQuestRequirement();
    installObservers();
    stripNotesCount();
    scheduleBonusUI();
    scheduleDockLayout();

    window.addEventListener("resize", scheduleDockLayout, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleDockLayout, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
