(() => {
  "use strict";

  if (window.__powerChoiceModeClientV2) return;
  window.__powerChoiceModeClientV2 = true;

  const MODE = "powerChoice";
  const SPY_MAX = 15;
  const INSPECTOR_MAX = 5;
  const VOWELS = new Set(["A", "E", "I", "O", "U"]);
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const cleanWord = value => String(value || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 5);
  const ordinal = value => ["1st", "2nd", "3rd", "4th", "5th"][Number(value) - 1] || `${value}th`;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  let questGuideOpen = false;
  let questHintsActive = false;
  let questVisualOverride = null;
  let lastQuestId = "";
  let lastDraftRect = null;
  let renderQueued = false;
  let spyVisualOverride = null;
  let spyAwardRunning = false;
  const spyAwardQueue = [];
  const deferredSetterHistory = [];
  let lastSpyAwardFinishedAt = 0;
  const rewardPopupQueue = [];
  let rewardPopupRunning = false;

  function me() {
    return window.currentUser?.id || window.getUserId?.() || null;
  }

  function isMode(state = window.state) {
    return !!(
      state &&
      state.gameMode === MODE &&
      state.powerChoice?.enabled
    );
  }

  function myRole(state = window.state) {
    const userId = me();
    if (userId && userId === state?.setter) return "setter";
    if (userId && userId === state?.guesser) return "guesser";
    return window.myRole || null;
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderAll();
    });
  }

  function ensureModeOption() {
    const select = byId("powerModeSelect");
    if (!select) return;
    let option = [...select.options].find(item => item.value === MODE);
    if (!option) {
      option = document.createElement("option");
      option.value = MODE;
      option.textContent = "Power Choice";
      select.insertBefore(option, select.firstChild);
    }
    if (
      window.state?.phase === "lobby" &&
      (window.state?.gameMode || MODE) === MODE &&
      document.activeElement !== select
    ) {
      select.value = MODE;
    }
  }

  function installModeUiWrapper() {
    const current = window.updatePowerModeUI;
    if (typeof current !== "function" || current.__powerChoiceV2Wrapped) return;
    const wrapped = async function (...args) {
      const result = await current.apply(this, args);
      ensureModeOption();
      if (window.state?.gameMode === MODE && byId("powerModeSelect")) {
        byId("powerModeSelect").value = MODE;
      }
      return result;
    };
    wrapped.__powerChoiceV2Wrapped = true;
    window.updatePowerModeUI = wrapped;
  }

  function meterMarkup(value, max, milestones, id, extraClass = "") {
    const safeValue = clamp(value, 0, max);
    const milestoneSet = new Set(milestones || []);
    return `<div id="${esc(id)}" class="pc-segment-meter ${esc(extraClass)}" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${safeValue}">
      ${Array.from({ length: max }, (_, index) => {
        const number = index + 1;
        const classes = ["pc-meter-segment"];
        if (number <= safeValue) classes.push("is-filled");
        if (milestoneSet.has(number)) classes.push("is-milestone");
        return `<span class="${classes.join(" ")}" data-pc-meter-value="${number}"></span>`;
      }).join("")}
    </div>`;
  }

  function spyDisplayTotal() {
    if (spyVisualOverride != null) return clamp(spyVisualOverride, 0, SPY_MAX);
    return clamp(window.state?.powers?.spyCharge?.total, 0, SPY_MAX);
  }

  function inspectorDisplayPoints() {
    if (questVisualOverride != null) return clamp(questVisualOverride, 0, INSPECTOR_MAX);
    return clamp(window.state?.powerChoice?.inspector?.points, 0, INSPECTOR_MAX);
  }

  function renderSpyPanel(container) {
    const total = spyDisplayTotal();
    const pending = window.state?.powerChoice?.pendingChoice?.role === "setter";
    const detailsOpen = container.dataset.pcDetailsOpen === "true";
    const signature = [total, pending, detailsOpen].join("|");
    if (container.dataset.pcSignature === signature) return;
    container.dataset.pcSignature = signature;
    container.innerHTML = `<section class="pc-side-panel pc-spy-panel">
      <button type="button" id="pcSpyChargeCard" class="pc-charge-card" aria-expanded="${detailsOpen}">
        <span class="pc-charge-label">SPY CHARGE</span>
        <span class="pc-charge-value"><strong>${total}</strong><span>/ ${SPY_MAX}</span></span>
        ${meterMarkup(total, SPY_MAX, [5, 8, 15], "pcSpyMeter", "pc-spy-meter")}
        <span class="pc-charge-click-copy">Click for rules</span>
      </button>
      <div class="pc-charge-details${detailsOpen ? " is-open" : ""}">
        <p>Earn at least 1 star after each eligible Keep/New decision. The forced all-gray opening begins with at least 2 stars.</p>
        <div class="pc-reward-milestones">
          <span><b>5</b> fixed reward choice</span>
          <span><b>8</b> three random powers</span>
          <span><b>15</b> advanced reward choice</span>
        </div>
      </div>
      ${pending ? `<div class="pc-choice-ready">REWARD CHOICE READY</div>` : ""}
    </section>`;
    byId("pcSpyChargeCard")?.addEventListener("click", () => {
      container.dataset.pcDetailsOpen = detailsOpen ? "false" : "true";
      container.dataset.pcSignature = "";
      renderSpyPanel(container);
    });
  }

  function questConditionLabels(quest) {
    if (!quest) return [];
    if (Array.isArray(quest.conditionLabels) && quest.conditionLabels.length) {
      return quest.conditionLabels.map(String);
    }
    if (Array.isArray(quest.conditions)) {
      return quest.conditions.map(formatCondition);
    }
    return [];
  }

  function renderInspectorPanel(container) {
    const inspector = window.state?.powerChoice?.inspector;
    const points = inspectorDisplayPoints();
    const next = inspector?.nextQuest;
    const conditions = questConditionLabels(next);
    const signature = JSON.stringify({ points, next: next?.id, conditions, pending: window.state?.powerChoice?.pendingChoice?.role === "guesser" });
    if (container.dataset.pcSignature === signature) return;
    container.dataset.pcSignature = signature;
    container.innerHTML = `<section class="pc-side-panel pc-inspector-panel">
      <div class="pc-inspector-charge">
        <span class="pc-charge-label">QUEST CHARGE</span>
        <span class="pc-charge-value"><strong>${points}</strong><span>/ ${INSPECTOR_MAX}</span></span>
        ${meterMarkup(points, INSPECTOR_MAX, [2, 3, 5], "pcInspectorMeter", "pc-inspector-meter")}
      </div>
      ${next ? `<article class="pc-next-quest">
        <span class="pc-next-kicker">NEXT QUEST</span>
        <p>${esc(next.description || "Complete the next condition.")}</p>
        ${conditions.length ? `<ul>${conditions.map(label => `<li>${esc(label)}</li>`).join("")}</ul>` : ""}
      </article>` : ""}
      ${window.state?.powerChoice?.pendingChoice?.role === "guesser" ? `<div class="pc-choice-ready">REWARD CHOICE READY</div>` : ""}
    </section>`;
  }

  function setterSidebarCollapsed() {
    const screen = byId("setterScreen");
    const toggle = byId("setterSidebarToggle");
    return !!(
      screen?.classList.contains("setter-sidebar-collapsed") ||
      toggle?.getAttribute("aria-expanded") === "false"
    );
  }

  function renderSpyMiniMeter() {
    const host = byId("setterSidebarChargeMini");
    if (!host) return;
    const show = isMode() && myRole() === "setter" && setterSidebarCollapsed();
    host.classList.toggle("hidden", !show);
    host.classList.toggle("pc-spy-mini-host", show);
    if (!show) return;
    const total = spyDisplayTotal();
    const signature = String(total);
    if (host.dataset.pcSignature === signature && byId("pcSpyMiniMeter")) return;
    host.dataset.pcSignature = signature;
    host.innerHTML = meterMarkup(total, SPY_MAX, [5, 8, 15], "pcSpyMiniMeter", "pc-spy-mini-meter");
    host.setAttribute("aria-hidden", "false");
    host.setAttribute("aria-label", `Spy charge ${total} of ${SPY_MAX}`);
  }

  function renderPanels() {
    const active = isMode();
    document.body.classList.toggle("power-choice-mode", active);
    if (!active) return;
    const role = myRole();
    const setter = byId("setterPowerContainer");
    const guesser = byId("guesserPowerContainer");
    if (role === "setter" && setter) renderSpyPanel(setter);
    if (role === "guesser" && guesser) renderInspectorPanel(guesser);
    renderSpyMiniMeter();
  }

  function formatCondition(condition) {
    if (!condition) return "Match the condition";
    const letter = cleanWord(condition.letter).slice(0, 1);
    const count = Number(condition.count);
    switch (condition.type) {
      case "startsWith": return `Start with ${letter}`;
      case "endsWith": return `End with ${letter}`;
      case "doubleLetter": return letter ? `Use double ${letter}` : "Use a doubled letter";
      case "minVowels": return `Use at least ${count} vowel${count === 1 ? "" : "s"}`;
      case "maxVowels": return `Use at most ${count} vowel${count === 1 ? "" : "s"}`;
      case "firstLastSame": return "Use the same first and last letter";
      case "palindrome": return "Make a palindrome";
      default: return String(condition.label || condition.text || "Match the condition");
    }
  }

  function evaluateCondition(condition, word) {
    const complete = /^[A-Z]{5}$/.test(word);
    if (!complete || !condition) return false;
    const letter = cleanWord(condition.letter).slice(0, 1);
    const count = [...word].filter(item => VOWELS.has(item)).length;
    switch (condition.type) {
      case "startsWith": return word.startsWith(letter);
      case "endsWith": return word.endsWith(letter);
      case "doubleLetter": return letter ? word.includes(letter + letter) : /(.)\1/.test(word);
      case "minVowels": return count >= Number(condition.count);
      case "maxVowels": return count <= Number(condition.count);
      case "firstLastSame": return word[0] === word[4];
      case "palindrome": return word === [...word].reverse().join("");
      default: return false;
    }
  }

  function knownClues(state = window.state) {
    const greenByIndex = new Map();
    const yellowLetters = new Set();
    for (const entry of state?.history || []) {
      const guess = cleanWord(entry?.guess);
      const feedback = Array.isArray(entry?.fbGuesser) ? entry.fbGuesser : entry?.fb;
      if (!Array.isArray(feedback)) continue;
      for (let index = 0; index < 5; index++) {
        const mark = String(feedback[index] || "").toLowerCase();
        if (mark.includes("🟩") || mark === "green" || mark === "g") {
          if (guess[index]) greenByIndex.set(index, guess[index]);
        }
        if (mark.includes("🟨") || mark === "yellow" || mark === "y") {
          if (guess[index]) yellowLetters.add(guess[index]);
        }
      }
    }
    for (const constraint of state?.extraConstraints || []) {
      const type = String(constraint?.type || "").toUpperCase();
      const letter = cleanWord(constraint?.letter).slice(0, 1);
      if (type === "GREEN" && Number.isInteger(constraint?.index) && letter) {
        greenByIndex.set(constraint.index, letter);
      }
      if (type === "YELLOW" && letter) yellowLetters.add(letter);
    }
    return { greenByIndex, yellowLetters };
  }

  function hardModeMet(word) {
    if (!/^[A-Z]{5}$/.test(word)) return false;
    const { greenByIndex, yellowLetters } = knownClues();
    for (const [index, letter] of greenByIndex) {
      if (word[index] !== letter) return false;
    }
    for (const letter of yellowLetters) {
      if (!word.includes(letter)) return false;
    }
    return true;
  }

  function evaluateQuest(quest, word) {
    const clean = cleanWord(word);
    if (!quest || !/^[A-Z]{5}$/.test(clean)) return false;
    switch (quest.type) {
      case "ROW": return [...clean].every(letter => String(quest.row || "").includes(letter));
      case "RARE": return (quest.letters || []).some(letter => clean.includes(cleanWord(letter).slice(0, 1)));
      case "ALPHA": {
        const codes = [...clean].map(letter => letter.charCodeAt(0));
        return codes.every((value, index) => index === 0 || value > codes[index - 1]) ||
          codes.every((value, index) => index === 0 || value < codes[index - 1]);
      }
      case "DOUBLES": return /(.)\1/.test(clean);
      case "HARDMODE": return hardModeMet(clean);
      case "FIELDREPORT": {
        const results = (quest.conditions || []).map(condition => evaluateCondition(condition, clean));
        return results.length === 3 && results.every(Boolean);
      }
      case "ALTERNATING": return [...clean].every((letter, index) => index === 0 || VOWELS.has(letter) !== VOWELS.has(clean[index - 1]));
      case "BOOKENDS": return clean[0] === clean[4];
      case "HALF_AM": return [...clean].every(letter => letter >= "A" && letter <= "P");
      case "HALF_NZ": return [...clean].every(letter => letter >= "K" && letter <= "Z");
      case "VOWELSHORTAGE": return [...clean].filter(letter => VOWELS.has(letter)).length === Number(quest.vowelTarget);
      default: return false;
    }
  }

  function currentDraftRow() {
    const container = byId("draftGuesser");
    return container?.__draftRows?.draft || container?.querySelector(".history-row.guesser-draft");
  }

  function currentDraftWord() {
    const row = currentDraftRow();
    const tiles = row?.__tiles || [...(row?.querySelectorAll(".history-tile") || [])];
    if (!tiles?.length) return "";
    return tiles.slice(0, 5).map(tile => {
      const text = String(tile?.textContent || "").trim().toUpperCase();
      return /^[A-Z]$/.test(text) ? text : " ";
    }).join("");
  }

  function hintSpecForQuest(quest, draftWord = currentDraftWord()) {
    if (!quest) return null;
    let letters = [];
    let label = "";
    const clean = cleanWord(draftWord);
    switch (quest.type) {
      case "ROW":
        letters = [...String(quest.row || "")];
        label = String(quest.row || "keyboard row");
        break;
      case "RARE":
        letters = (quest.letters || []).map(letter => cleanWord(letter).slice(0, 1));
        label = letters.join(" · ");
        break;
      case "HALF_AM":
        letters = ALPHABET.slice(0, 16);
        label = "A–P";
        break;
      case "HALF_NZ":
        letters = ALPHABET.slice(10);
        label = "K–Z";
        break;
      case "ALTERNATING":
      case "VOWELSHORTAGE":
        letters = [...VOWELS];
        label = "vowels";
        break;
      case "DOUBLES": {
        const final = clean.at(-1);
        if (final) {
          letters = [final];
          label = `double ${final}`;
        }
        break;
      }
      case "BOOKENDS": {
        const first = clean[0];
        if (first) {
          letters = [first];
          label = `finish with ${first}`;
        }
        break;
      }
      case "HARDMODE": {
        const clues = knownClues();
        letters = [...new Set([...clues.greenByIndex.values(), ...clues.yellowLetters])];
        label = "known clue letters";
        break;
      }
      case "FIELDREPORT": {
        const collected = new Set();
        for (const condition of quest.conditions || []) {
          if (["startsWith", "endsWith", "doubleLetter"].includes(condition.type) && condition.letter) {
            collected.add(cleanWord(condition.letter).slice(0, 1));
          }
          if (["minVowels", "maxVowels"].includes(condition.type)) {
            for (const vowel of VOWELS) collected.add(vowel);
          }
        }
        letters = [...collected];
        label = letters.length ? "useful condition letters" : "";
        break;
      }
      default:
        return null;
    }
    letters = [...new Set(letters.filter(letter => /^[A-Z]$/.test(letter)))];
    return letters.length ? { letters, label } : null;
  }

  function ensureCurrentQuestHost() {
    const draftWrap = document.querySelector("#guesserScreen .draft-row-wrap");
    if (!draftWrap) return null;
    let host = byId("pcCurrentQuestHost");
    if (!host) {
      host = document.createElement("section");
      host.id = "pcCurrentQuestHost";
      host.className = "pc-current-quest-host";
      draftWrap.parentElement?.insertBefore(host, draftWrap);
    } else if (host.nextElementSibling !== draftWrap) {
      draftWrap.parentElement?.insertBefore(host, draftWrap);
    }
    return host;
  }

  function renderCurrentQuest() {
    const host = ensureCurrentQuestHost();
    const state = window.state;
    const quest = state?.powerChoice?.inspector?.currentQuest;
    const show = isMode(state) && myRole(state) === "guesser" && !!quest;
    if (!host) return;
    host.classList.toggle("hidden", !show);
    if (!show) return;

    if (quest.id !== lastQuestId) {
      lastQuestId = quest.id || "";
      questGuideOpen = false;
      questHintsActive = false;
      clearQuestKeyHints();
    }

    const rawDraft = currentDraftWord();
    const word = cleanWord(rawDraft);
    const complete = word.length === 5 && !rawDraft.includes(" ");
    const met = complete && evaluateQuest(quest, word);
    const conditionLabels = questConditionLabels(quest);
    const conditionResults = quest.type === "FIELDREPORT"
      ? (quest.conditions || []).map(condition => complete && evaluateCondition(condition, word))
      : [];
    const hintSpec = hintSpecForQuest(quest, rawDraft);
    const signature = JSON.stringify({
      id: quest.id,
      word: rawDraft,
      met,
      conditions: conditionResults,
      open: questGuideOpen,
      hints: questHintsActive,
      hintLabel: hintSpec?.label
    });
    if (host.dataset.pcSignature === signature) {
      const row = currentDraftRow();
      row?.classList.toggle("pc-quest-draft-met", met);
      if (row?.isConnected) lastDraftRect = row.getBoundingClientRect();
      applyQuestKeyHints();
      return;
    }
    host.dataset.pcSignature = signature;

    host.innerHTML = `<button type="button" class="pc-current-quest-card${met ? " is-met" : ""}" aria-expanded="${questGuideOpen}">
      <span class="pc-current-kicker">CURRENT QUEST</span>
      <span class="pc-current-main">
        <strong>${esc(quest.title || "Quest")}</strong>
        <span>${esc(quest.description || "Complete the shown condition.")}</span>
      </span>
      <span class="pc-current-status" aria-live="polite">${met ? "MET" : ""}</span>
      ${conditionLabels.length ? `<span class="pc-current-conditions">${conditionLabels.map((label, index) => `<span class="pc-condition-chip${conditionResults[index] ? " is-met" : ""}">${esc(label)}</span>`).join("")}</span>` : ""}
      <span class="pc-current-expand">${questGuideOpen ? "Close guide" : "Rules & keyboard guide"}</span>
    </button>
    <div class="pc-quest-guide${questGuideOpen ? " is-open" : ""}">
      <p>${esc(guideCopyForQuest(quest))}</p>
      ${hintSpec ? `<div class="pc-guide-actions">
        <button type="button" class="pc-guide-highlight-btn">${questHintsActive ? "Refresh" : "Highlight"} ${esc(hintSpec.label)}</button>
        ${questHintsActive ? `<button type="button" class="pc-guide-clear-btn">Clear highlights</button>` : ""}
      </div>` : `<span class="pc-guide-no-keys">This quest is based on word structure, so no fixed keyboard range is needed.</span>`}
    </div>`;

    host.querySelector(".pc-current-quest-card")?.addEventListener("click", () => {
      questGuideOpen = !questGuideOpen;
      host.dataset.pcSignature = "";
      renderCurrentQuest();
    });
    host.querySelector(".pc-guide-highlight-btn")?.addEventListener("click", event => {
      event.stopPropagation();
      questHintsActive = true;
      applyQuestKeyHints();
      host.dataset.pcSignature = "";
      renderCurrentQuest();
    });
    host.querySelector(".pc-guide-clear-btn")?.addEventListener("click", event => {
      event.stopPropagation();
      questHintsActive = false;
      clearQuestKeyHints();
      host.dataset.pcSignature = "";
      renderCurrentQuest();
    });

    const row = currentDraftRow();
    row?.classList.toggle("pc-quest-draft-met", met);
    if (row?.isConnected) lastDraftRect = row.getBoundingClientRect();
    applyQuestKeyHints();
  }

  function guideCopyForQuest(quest) {
    switch (quest?.type) {
      case "ROW": return `Every letter must come from the ${quest.row} keyboard row.`;
      case "RARE": return `Include at least one of ${quest.letters?.join(", ") || "the listed letters"}.`;
      case "ALPHA": return "All five letters must move strictly forward or strictly backward through the alphabet.";
      case "DOUBLES": return "Place the same letter twice in adjacent positions, such as LL or EE.";
      case "HARDMODE": return "Keep every known green in place and include every known yellow letter.";
      case "FIELDREPORT": return "All three conditions must be satisfied by the same submitted word.";
      case "ALTERNATING": return "Alternate vowel and consonant status at every position.";
      case "BOOKENDS": return "The first and fifth letters must be identical.";
      case "HALF_AM": return "Every letter must be from A through P, inclusive.";
      case "HALF_NZ": return "Every letter must be from K through Z, inclusive.";
      case "VOWELSHORTAGE": return `Use exactly ${Number(quest.vowelTarget) || 1} vowel${Number(quest.vowelTarget) === 1 ? "" : "s"}.`;
      default: return quest?.description || "Complete the shown condition.";
    }
  }

  function keyboardLetter(key) {
    const candidate = String(
      key?.dataset?.key ||
      key?.dataset?.letter ||
      key?.getAttribute?.("aria-label") ||
      key?.textContent ||
      ""
    ).trim().toUpperCase();
    const match = candidate.match(/[A-Z]/);
    return match?.[0] || "";
  }

  function keyboardKeys() {
    return [...document.querySelectorAll(
      "#keyboardGuesser button, #keyboardGuesser [data-key], #keyboardGuesser [data-letter], #keyboardGuesser .key"
    )];
  }

  function clearQuestKeyHints() {
    keyboardKeys().forEach(key => key.classList.remove("pc-quest-key-hint"));
  }

  function applyQuestKeyHints() {
    if (!isMode() || myRole() !== "guesser" || !questHintsActive) {
      clearQuestKeyHints();
      return;
    }
    const quest = window.state?.powerChoice?.inspector?.currentQuest;
    const spec = hintSpecForQuest(quest);
    const letters = new Set(spec?.letters || []);
    keyboardKeys().forEach(key => {
      key.classList.toggle("pc-quest-key-hint", letters.has(keyboardLetter(key)));
    });
  }

  function removeSetterTargetLetters() {
    if (!isMode()) return;
    document.querySelectorAll(
      "#draftSetter .setter-target-corner-letter-v2, " +
      "#draftSetter .setter-target-corner-letter, " +
      "#draftSetter .setter-target-corner-letter-v10, " +
      "#draftSetter [class*='target-corner-letter'], " +
      "#draftSetter .setter-draft-target-letter, " +
      "#draftSetter [class*='draft-target-letter'], " +
      "#draftSetter [data-target-letter-badge], " +
      "#draftSetter .draft-hint-letter"
    ).forEach(element => element.remove());

    // Earlier UI revisions also wrote the bonus letter into data attributes
    // or pseudo-elements. Keep the blue target outline, but remove every
    // source from which a corner letter can be rendered.
    document.querySelectorAll("#draftSetter .history-tile").forEach(tile => {
      [
        "data-target-letter",
        "data-target-letter-badge",
        "data-bonus-letter",
        "data-hint-letter"
      ].forEach(name => tile.removeAttribute(name));
    });
  }

  function normalizeBonusTarget() {
    if (!isMode()) return;
    removeSetterTargetLetters();
    const target = byId("setterBonusTargetV9");
    if (!target) return;

    target.classList.add("pc-bonus-target-unified");
    const hint = window.state?.powers?.spyCharge?.hint;
    const letter = cleanWord(hint?.letter).slice(0, 1);
    const positionIndex = Number(hint?.position);
    if (!letter || !Number.isInteger(positionIndex) || positionIndex < 0 || positionIndex > 4) {
      return;
    }

    const positionLabel = ordinal(positionIndex + 1);
    const signature = `${letter}:${positionIndex}`;
    const currentLetter = target.querySelector(".setter-bonus-letter-chip-v2")?.textContent;
    const currentCopy = target.querySelector(".setter-bonus-position-copy-v2")?.textContent;
    if (
      target.dataset.pcBonusSignature !== signature ||
      currentLetter !== letter ||
      currentCopy !== `in ${positionLabel}`
    ) {
      const plus = document.createElement("span");
      plus.className = "setter-bonus-plus-v10";
      plus.setAttribute("aria-hidden", "true");
      plus.textContent = "+★";

      const position = document.createElement("span");
      position.className = "setter-bonus-position-v10 pc-bonus-position";

      const chip = document.createElement("strong");
      chip.className = "setter-bonus-letter-chip-v2";
      chip.textContent = letter;

      const copy = document.createElement("span");
      copy.className = "setter-bonus-position-copy-v2";
      copy.textContent = `in ${positionLabel}`;

      position.append(chip, copy);
      target.replaceChildren(plus, position);
      target.dataset.pcBonusSignature = signature;
    }
    target.setAttribute("aria-label", `Bonus star: ${letter} in ${positionLabel}`);
  }

  function ensureChoiceModal() {
    let modal = byId("powerChoiceModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "powerChoiceModal";
    modal.className = "pc-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `<div class="pc-modal-card">
      <div class="pc-modal-kicker">REWARD READY · +30 SECONDS</div>
      <h2></h2>
      <p class="pc-modal-sub"></p>
      <div class="pc-card-grid"></div>
    </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function optionIcon(option) {
    if (option?.kind === "power") {
      return window.POWER_METADATA?.[option.powerId]?.emoji || option.icon || "⚡";
    }
    return option?.icon || "◆";
  }

  function showChoice() {
    const modal = ensureChoiceModal();
    const pending = window.state?.powerChoice?.pendingChoice;
    if (!isMode() || !pending || pending.ownerUserId !== me()) {
      modal.classList.remove("is-open");
      modal.dataset.choiceId = "";
      return;
    }
    if (modal.dataset.choiceId === pending.id && modal.classList.contains("is-open")) return;
    modal.dataset.choiceId = pending.id;
    modal.querySelector("h2").textContent = pending.title || "Choose a reward";
    modal.querySelector(".pc-modal-sub").textContent = pending.subtitle || "Choose one card. It activates immediately.";
    const grid = modal.querySelector(".pc-card-grid");
    grid.innerHTML = (pending.options || []).map(option => {
      const tier = option.kind === "power"
        ? `<span class="pc-tier">TIER ${option.tier || window.POWER_TIERS?.[option.powerId]?.tier || 1}</span>`
        : "";
      return `<button type="button" class="pc-choice-card" data-option-id="${esc(option.id)}">
        <span class="pc-card-icon">${esc(optionIcon(option))}</span>
        ${tier}
        <strong>${esc(option.title)}</strong>
        <span class="pc-card-desc">${esc(option.description)}</span>
        <span class="pc-card-pick">CHOOSE</span>
      </button>`;
    }).join("");
    grid.querySelectorAll(".pc-choice-card").forEach(button => {
      button.addEventListener("click", () => {
        if (button.disabled) return;
        grid.querySelectorAll("button").forEach(item => { item.disabled = true; });
        window.sendGameAction?.({
          type: "POWER_CHOICE_SELECT",
          userId: me(),
          choiceId: pending.id,
          optionId: button.dataset.optionId
        });
      });
    });
    modal.classList.add("is-open");
    grid.querySelector("button")?.focus();
  }

  function markEliminatedKeys() {
    const eliminated = new Set(window.state?.powerChoice?.eliminatedLetters || []);
    keyboardKeys().forEach(key => {
      const letter = keyboardLetter(key);
      const blocked = !!letter && eliminated.has(letter);
      key.classList.toggle("pc-key-eliminated", blocked);
      key.setAttribute("aria-disabled", blocked ? "true" : "false");
      if (blocked) key.title = `${letter} was ruled out`;
    });
  }

  function blockedLetter(letter) {
    return isMode() && myRole() === "guesser" &&
      (window.state?.powerChoice?.eliminatedLetters || []).includes(String(letter || "").toUpperCase());
  }

  document.addEventListener("click", event => {
    const key = event.target.closest?.(
      "#keyboardGuesser button, #keyboardGuesser [data-key], #keyboardGuesser [data-letter], #keyboardGuesser .key"
    );
    if (!key) return;
    const letter = keyboardLetter(key);
    if (!blockedLetter(letter)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.toast?.(`${letter} was ruled out by your reward.`);
  }, true);

  document.addEventListener("keydown", event => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      !/^[a-z]$/i.test(event.key) ||
      !blockedLetter(event.key)
    ) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.toast?.(`${event.key.toUpperCase()} was ruled out by your reward.`);
  }, true);

  function getQuestMeterRect() {
    return byId("pcInspectorMeter")?.getBoundingClientRect() || null;
  }

  async function animateQuestCharge(payload) {
    if (!payload?.success || myRole() !== "guesser" || !isMode()) return;
    const source = lastDraftRect || currentDraftRow()?.getBoundingClientRect();
    const target = getQuestMeterRect();
    if (!source?.width || !target?.width) return;

    questVisualOverride = clamp(payload.before, 0, INSPECTOR_MAX);
    renderPanels();

    const orb = document.createElement("div");
    orb.className = "pc-quest-flight-orb";
    orb.innerHTML = `<span>⚡</span>`;
    const startX = source.left + source.width / 2;
    const startY = source.top + source.height / 2;
    const endX = target.left + target.width / 2;
    const endY = target.top + target.height / 2;
    Object.assign(orb.style, { left: `${startX}px`, top: `${startY}px` });
    document.body.appendChild(orb);

    const dx = endX - startX;
    const dy = endY - startY;
    const arcY = Math.min(startY, endY) - Math.max(70, Math.abs(dx) * 0.14);
    const animation = orb.animate([
      { transform: "translate(-50%, -50%) scale(.55)", opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${arcY - startY}px)) scale(1.1)`, opacity: 1, offset: 0.3 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.35)`, opacity: 1 }
    ], {
      duration: 760,
      easing: "cubic-bezier(.18,.78,.18,1)",
      fill: "forwards"
    });
    try { await animation.finished; } catch {}
    orb.remove();

    questVisualOverride = clamp(payload.after, 0, INSPECTOR_MAX);
    renderPanels();
    const segment = byId("pcInspectorMeter")?.querySelector(`[data-pc-meter-value="${clamp(payload.after, 1, INSPECTOR_MAX)}"]`);
    segment?.classList.add("just-landed");
    setTimeout(() => segment?.classList.remove("just-landed"), 700);
    setTimeout(() => {
      questVisualOverride = null;
      renderPanels();
    }, 850);
  }

  function captureSetterSourceRect() {
    const bonus = byId("setterBonusTargetV9");
    if (bonus && !bonus.classList.contains("hidden")) return bonus.getBoundingClientRect();
    const row = byId("draftSetter")?.__draftRows?.draft || document.querySelector("#draftSetter .history-row.setter-draft");
    return row?.getBoundingClientRect() || null;
  }

  function spyAwardTarget() {
    const id = setterSidebarCollapsed() ? "pcSpyMiniMeter" : "pcSpyMeter";
    return byId(id) || byId("pcSpyMeter") || byId("pcSpyMiniMeter");
  }

  function capsuleMeter(capsule, value, bonusFrom = Infinity) {
    const meter = capsule.querySelector(".pc-award-capsule-meter");
    if (!meter) return;
    meter.innerHTML = Array.from({ length: SPY_MAX }, (_, index) => {
      const number = index + 1;
      const classes = ["pc-award-capsule-segment"];
      if (number <= value) classes.push("is-filled");
      if (number >= bonusFrom && number <= value) classes.push("is-bonus");
      if ([5, 8, 15].includes(number)) classes.push("is-milestone");
      return `<span class="${classes.join(" ")}" data-value="${number}"></span>`;
    }).join("");
  }

  function createAwardCapsule(before) {
    const capsule = document.createElement("div");
    capsule.className = "pc-spy-award-capsule";
    capsule.innerHTML = `<span class="pc-award-star">★</span><div class="pc-award-capsule-meter"></div><span class="pc-award-count">${before}/${SPY_MAX}</span>`;
    capsuleMeter(capsule, before);
    document.body.appendChild(capsule);
    requestAnimationFrame(() => capsule.classList.add("is-visible"));
    return capsule;
  }

  async function animateSpyAward(entry) {
    const payload = entry?.payload || {};
    const before = clamp(payload.before, 0, SPY_MAX);
    const appliedBase = Math.max(0, Number(payload.appliedBaseStars ?? payload.baseStars) || 0);
    const appliedBonus = Math.max(0, Number(payload.appliedBonusStars ?? payload.bonusStars) || 0);
    const totalStars = Math.max(0, Number(payload.appliedStars) || appliedBase + appliedBonus);
    const after = clamp(payload.after ?? before + totalStars, 0, SPY_MAX);
    if (!totalStars) {
      spyVisualOverride = after;
      renderPanels();
      return;
    }

    spyVisualOverride = before;
    renderPanels();
    const capsule = createAwardCapsule(before);
    const sourceRect = entry.sourceRect;
    if (sourceRect?.width) {
      const pulse = document.createElement("span");
      pulse.className = "pc-spy-source-pulse";
      pulse.textContent = "★";
      Object.assign(pulse.style, {
        left: `${sourceRect.left + sourceRect.width / 2}px`,
        top: `${sourceRect.top + sourceRect.height / 2}px`
      });
      document.body.appendChild(pulse);
      pulse.animate([
        { transform: "translate(-50%,-50%) scale(.4)", opacity: 0 },
        { transform: "translate(-50%,-50%) scale(1.15)", opacity: 1 },
        { transform: "translate(-50%,-50%) scale(1.7)", opacity: 0 }
      ], { duration: 520, easing: "ease-out" }).finished.finally(() => pulse.remove());
    }

    await sleep(180);
    const bonusStartValue = before + appliedBase + 1;
    for (let index = 0; index < totalStars; index++) {
      const value = Math.min(after, before + index + 1);
      const bonus = index >= appliedBase;
      const star = document.createElement("span");
      star.className = `pc-award-falling-star${bonus ? " is-bonus" : ""}`;
      star.textContent = "★";
      capsule.appendChild(star);
      const targetSegment = capsule.querySelector(`[data-value="${value}"]`);
      const capsuleRect = capsule.getBoundingClientRect();
      const segmentRect = targetSegment?.getBoundingClientRect();
      const startX = capsuleRect.width * 0.12;
      const endX = segmentRect ? segmentRect.left + segmentRect.width / 2 - capsuleRect.left : capsuleRect.width * .5;
      star.style.left = `${startX}px`;
      star.style.top = "-8px";
      const anim = star.animate([
        { transform: "translate(-50%,-130%) scale(.55) rotate(-25deg)", opacity: 0 },
        { transform: `translate(${(endX - startX) * .45}px,-28px) scale(1.15) rotate(8deg)`, opacity: 1, offset: .45 },
        { transform: `translate(${endX - startX}px,25px) scale(.42) rotate(0deg)`, opacity: 1 }
      ], { duration: 430, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      try { await anim.finished; } catch {}
      star.remove();
      spyVisualOverride = value;
      capsuleMeter(capsule, value, appliedBonus > 0 ? bonusStartValue : Infinity);
      capsule.querySelector(".pc-award-count").textContent = `${value}/${SPY_MAX}`;
      const landed = capsule.querySelector(`[data-value="${value}"]`);
      landed?.classList.add("just-landed");
      await sleep(95);
    }

    await sleep(260);
    const target = spyAwardTarget();
    const targetRect = target?.getBoundingClientRect();
    if (targetRect?.width) {
      const capsuleRect = capsule.getBoundingClientRect();
      const dx = targetRect.left + targetRect.width / 2 - (capsuleRect.left + capsuleRect.width / 2);
      const dy = targetRect.top + targetRect.height / 2 - (capsuleRect.top + capsuleRect.height / 2);
      const flight = capsule.animate([
        { transform: "translate(-50%, 0) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(.42)`, opacity: .9 }
      ], { duration: 520, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" });
      try { await flight.finished; } catch {}
    }
    capsule.remove();
    spyVisualOverride = after;
    renderPanels();
    const targetMeter = spyAwardTarget();
    targetMeter?.classList.add("just-charged");
    setTimeout(() => targetMeter?.classList.remove("just-charged"), 850);
    await sleep(180);
  }

  function flushDeferredSetterHistory() {
    const releases = deferredSetterHistory.splice(0);
    releases.forEach(release => {
      try { requestAnimationFrame(release); } catch {}
    });
  }

  async function drainSpyAwardQueue() {
    if (spyAwardRunning || !spyAwardQueue.length || myRole() !== "setter") return;
    spyAwardRunning = true;
    try {
      while (spyAwardQueue.length) {
        await animateSpyAward(spyAwardQueue.shift());
      }
    } finally {
      spyAwardRunning = false;
      lastSpyAwardFinishedAt = Date.now();
      spyVisualOverride = null;
      renderPanels();
      setTimeout(flushDeferredSetterHistory, 120);
    }
  }

  function installSetterHistoryDeferral() {
    if (window.deferSetterHistoryUntilSpyCharge?.__powerChoiceV2Wrapped) return;
    const previous = window.deferSetterHistoryUntilSpyCharge;
    const previousAnimating = window.isSpyChargeAwardAnimating;
    const wrapped = function (release) {
      if (!isMode() || myRole() !== "setter") {
        return typeof previous === "function" ? previous(release) : false;
      }
      if (typeof release !== "function") return false;
      if (
        spyAwardRunning ||
        spyAwardQueue.length ||
        Date.now() - lastSpyAwardFinishedAt < 850
      ) {
        deferredSetterHistory.push(release);
        setTimeout(() => {
          if (!spyAwardRunning && !spyAwardQueue.length) flushDeferredSetterHistory();
        }, 1700);
        return true;
      }
      return false;
    };
    wrapped.__powerChoiceV2Wrapped = true;
    window.deferSetterHistoryUntilSpyCharge = wrapped;
    window.isSpyChargeAwardAnimating = () => isMode()
      ? spyAwardRunning || spyAwardQueue.length > 0
      : typeof previousAnimating === "function" && !!previousAnimating();
  }

  function ensureRewardPopup() {
    let popup = byId("pcRewardPopup");
    if (popup) return popup;
    popup = document.createElement("aside");
    popup.id = "pcRewardPopup";
    popup.className = "pc-reward-popup";
    popup.setAttribute("role", "status");
    popup.setAttribute("aria-live", "polite");
    document.body.appendChild(popup);
    return popup;
  }

  async function drainRewardPopups() {
    if (rewardPopupRunning || !rewardPopupQueue.length) return;
    rewardPopupRunning = true;
    const popup = ensureRewardPopup();
    while (rewardPopupQueue.length) {
      const payload = rewardPopupQueue.shift() || {};
      const mine = payload.ownerUserId === me();
      popup.innerHTML = `<span class="pc-reward-popup-icon">${esc(payload.icon || "◆")}</span>
        <span class="pc-reward-popup-copy">
          <small>${mine ? "YOUR REWARD" : "OPPONENT REWARD"}</small>
          <strong>${esc(payload.title || "Reward activated")}</strong>
          <span>${esc(payload.detailText || payload.description || "Activated immediately.")}</span>
        </span>`;
      popup.classList.remove("show");
      void popup.offsetWidth;
      popup.classList.add("show");
      await sleep(3100);
      popup.classList.remove("show");
      await sleep(250);
    }
    rewardPopupRunning = false;
  }

  function renderAll() {
    installModeUiWrapper();
    installSetterHistoryDeferral();
    ensureModeOption();
    renderPanels();
    renderCurrentQuest();
    showChoice();
    markEliminatedKeys();
    applyQuestKeyHints();
    normalizeBonusTarget();
  }

  function installObservers() {
    const observer = new MutationObserver(scheduleRender);
    const targets = [
      byId("draftGuesser"),
      byId("keyboardGuesser"),
      byId("draftSetter"),
      byId("setterBonusTargetV9"),
      byId("setterScreen"),
      byId("guesserScreen")
    ].filter(Boolean);
    targets.forEach(target => observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "aria-expanded", "style"]
    }));
  }

  try {
    socket.on("stateUpdate", () => setTimeout(scheduleRender, 0));
    socket.on("powerChoiceQuestResult", payload => {
      if (payload?.success) animateQuestCharge(payload);
    });
    socket.on("spyChargeAward", payload => {
      if (!isMode() || myRole() !== "setter") return;
      spyAwardQueue.push({
        payload: payload || {},
        sourceRect: captureSetterSourceRect()
      });
      drainSpyAwardQueue();
    });
    socket.on("powerChoiceResolved", payload => {
      rewardPopupQueue.push(payload || {});
      drainRewardPopups();
      scheduleRender();
    });
  } catch {}

  function init() {
    renderAll();
    installObservers();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleRender();
    });
    window.addEventListener("resize", scheduleRender, { passive: true });
    setInterval(renderAll, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
