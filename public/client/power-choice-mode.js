(() => {
  "use strict";

  if (window.__powerChoiceModeClientV2) return;
  window.__powerChoiceModeClientV2 = true;

  const MODE = "powerChoice";
  const SPY_MAX = 15;
  const VOWELS = new Set(["A", "E", "I", "O", "U"]);
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
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
  let lastQuestId = "";
  let renderQueued = false;
  let spyVisualOverride = null;
  let spyAwardRunning = false;
  const spyAwardQueue = [];
  const deferredSetterHistory = [];
  let deferredHistoryTimer = null;
  let lastSpyAwardFinishedAt = 0;
  // Breathing room between the last star landing in the meter and the row
  // starting its own flight, so the two read as one sequence rather than a
  // hard cut.
  const AWARD_SETTLE_MS = 160;
  // spyChargeAward and stateUpdate are two independent socket events with
  // no ordering guarantee between them. When stateUpdate won the race the
  // award queue was still empty at the moment the history row asked to be
  // released, so the row flew off WHILE the stars were still shooting into
  // the meter. This is how long the row waits for an award that is about
  // to arrive before giving up and flying on its own.
  const AWARD_ARRIVAL_GRACE_MS = 300;
  const rewardPopupQueue = [];
  let rewardPopupRunning = false;
  // How long the reward-choice modal waits before opening once a choice
  // goes pending -- outlasts the guess "flying off" to the setter
  // (draft-row-slide-out, 340ms) plus the feedback tiles flipping in
  // (history-wordle-flip, staggered up to ~1360ms), so the cards don't
  // pop up on top of those animations still playing.
  const REWARD_MODAL_SETTLE_MS = 1500;
  let rewardModalTimer = null;
  let rewardModalPendingId = "";

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

  // Letter Lockout, once unlocked as a persistent Power Choice reward (see
  // PERSISTENT_POWER_IDS server-side): a compact "Lock a letter" button
  // that arms letter-picking on the Spy's own keyboard, same
  // arm-then-tap-a-letter shape as Hide Evidence (powerEngine/powers/
  // hideTile.js) -- handleSetterInput (client.js) checks
  // letterLockoutKbActive()/letterLockoutKbInput() the same way it already
  // checks hideTile's pair. The server side (letterLockoutServer.js) was
  // already fully built for the classic draft/custom loadout; this is
  // only the missing client trigger for Power Choice's own path to it.
  let letterLockoutArmed = false;

  function letterLockoutGranted() {
    return (window.state?.powers?.powerChoicePersistentGrants?.setter || [])
      .includes("letterLockout");
  }

  function canArmLetterLockout() {
    const state = window.state;
    // Mirrors POWER_RULES.js's own letterLockout.allowed() exactly -- the
    // server rejects the USE_LETTER_LOCKOUT action outright without a
    // pending guess (there's a live line of the guesser's next attempt for
    // the ban to actually take effect against, see the server module's own
    // header comment).
    return !!(
      letterLockoutGranted() &&
      myRole() === "setter" &&
      state?.phase === "normal" &&
      state?.turn === state?.setter &&
      state?.pendingGuess &&
      !state?.powers?.letterLockoutBanned
    );
  }

  function syncLetterLockoutKeyboardVisual() {
    document.getElementById("keyboardSetter")?.classList.toggle("keyboard-picking-hide", letterLockoutArmed);
    window.setKeyboardPickHint?.(letterLockoutArmed, "Pick a letter from the keyboard to ban it");
  }

  window.letterLockoutKbActive = () => letterLockoutArmed;

  window.letterLockoutKbReset = () => {
    letterLockoutArmed = false;
    syncLetterLockoutKeyboardVisual();
  };

  window.letterLockoutKbInput = function (event) {
    if (!letterLockoutArmed) return false;
    if (event.type !== "LETTER") return true; // swallow backspace/enter while armed

    const letter = String(event.value || "").toUpperCase();
    letterLockoutArmed = false;
    syncLetterLockoutKeyboardVisual();

    const submit = () => {
      // Must match the action type powerEngine/powers/letterLockout.js's
      // own modal sends -- normal.js's generic USE_ handler derives the
      // powerId straight from action.type (normalizePowerId), it isn't
      // read from a separate field.
      window.sendGameAction?.({ type: "USE_LETTER_LOCKOUT", letter, role: "setter" });
    };

    if (typeof window.showPowerActionPopup === "function") {
      window.showPowerActionPopup({
        emoji: window.POWER_METADATA?.letterLockout?.emoji || "🚫",
        title: `Ban ${letter}?`,
        desc: `The Inspector's next guess cannot use ${letter}. Once picked, ${letter} can never be banned again this match.`,
        useLabel: `Ban ${letter}`,
        showUse: true,
        useEnabled: true,
        onUse: submit
      });
    } else if (window.confirm(`Ban ${letter} from the Inspector's next guess?`)) {
      submit();
    }
    return true;
  };

  function renderSpyPanel(container) {
    const total = spyDisplayTotal();
    const pending = window.state?.powerChoice?.pendingChoice?.role === "setter";
    const detailsOpen = container.dataset.pcDetailsOpen === "true";
    const lockoutGranted = letterLockoutGranted();
    const lockoutArmable = canArmLetterLockout();
    // Disarms itself the moment arming is no longer valid (the Spy's turn
    // ended, a letter got banned through some other path, etc.) instead
    // of leaving the keyboard outlined for a pick that can no longer go
    // through -- same self-correcting check hideTile.js's uiEffects does.
    if (letterLockoutArmed && !lockoutArmable) {
      letterLockoutArmed = false;
      syncLetterLockoutKeyboardVisual();
    }
    const bannedLetter = window.state?.powers?.letterLockoutBanned || "";
    const signature = [total, pending, detailsOpen, lockoutGranted, lockoutArmable, letterLockoutArmed, bannedLetter].join("|");
    if (container.dataset.pcSignature === signature) return;
    container.dataset.pcSignature = signature;
    const lockoutMarkup = lockoutGranted
      ? `<button type="button" id="pcLetterLockoutBtn"
          class="pc-letter-lockout-btn${letterLockoutArmed ? " is-armed" : ""}"
          ${lockoutArmable ? "" : "disabled"}>
          <span aria-hidden="true">🚫</span>
          ${bannedLetter
            ? `${esc(bannedLetter)} banned this guess`
            : letterLockoutArmed
              ? "Tap a keyboard letter…"
              : "Lock a letter"}
        </button>`
      : "";
    container.innerHTML = `<section class="pc-side-panel pc-spy-panel">
      <button type="button" id="pcSpyChargeCard" class="pc-charge-card" aria-expanded="${detailsOpen}">
        <span class="pc-charge-label"><span class="pc-charge-star" aria-hidden="true">&#9733;</span>SPYOMETER</span>
        <div class="pc-meter-wrap">
          ${meterMarkup(total, SPY_MAX, [5, 9, 15], "pcSpyMeter", "pc-spy-meter")}
          <span class="pc-charge-value"><strong>${total}</strong><span>/ ${SPY_MAX}</span></span>
        </div>
        <span class="pc-charge-click-copy">Click for rules</span>
      </button>
      <div class="pc-charge-details${detailsOpen ? " is-open" : ""}">
        <p>Earn at least 1 star after each eligible Keep/New decision. The forced all-gray opening begins with at least 2 stars.</p>
        <div class="pc-reward-milestones">
          <span><b>5</b> fixed reward choice</span>
          <span><b>9</b> three random powers</span>
          <span><b>15</b> advanced reward choice</span>
        </div>
      </div>
      ${lockoutMarkup}
      ${pending ? `<div class="pc-choice-ready">REWARD CHOICE READY</div>` : ""}
    </section>`;
    byId("pcSpyChargeCard")?.addEventListener("click", () => {
      container.dataset.pcDetailsOpen = detailsOpen ? "false" : "true";
      container.dataset.pcSignature = "";
      renderSpyPanel(container);
    });
    byId("pcLetterLockoutBtn")?.addEventListener("click", () => {
      if (!canArmLetterLockout()) {
        if (letterLockoutArmed) {
          letterLockoutArmed = false;
          container.dataset.pcSignature = "";
          renderSpyPanel(container);
        }
        return;
      }
      letterLockoutArmed = !letterLockoutArmed;
      container.dataset.pcSignature = "";
      renderSpyPanel(container);
      syncLetterLockoutKeyboardVisual();
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

  // Informant (revealLocation) and Letter Profile are both "always on, no
  // button to click" powers -- their whole classic UI (PowerEngine.
  // register's renderButton) mounts into #guesserPowerContainer, which is
  // permanently display:none in the current layout (the sidebar redesign
  // gave the power/quest cards their own homes instead, see index.html's
  // comment on that container). Once Power Choice can actually grant
  // these as persistent rewards (see PERSISTENT_POWER_IDS server-side)
  // that dead-end stops being harmless, so they get their own compact
  // readout here instead of relying on that hidden legacy tray.
  function persistentPowerMarkup() {
    const grants = window.state?.powers?.powerChoicePersistentGrants?.guesser || [];
    if (!grants.length) return "";
    const lines = [];
    if (grants.includes("revealLocation")) {
      const peek = window.state?.powers?.revealLocationPeek;
      const value = peek && Number.isInteger(peek.index) && peek.letter
        ? `<strong>${esc(ordinal(peek.index + 1))}</strong> is <strong>${esc(peek.letter)}</strong>`
        : `<span class="pc-persistent-power-pending">watching…</span>`;
      lines.push(`<div class="pc-persistent-power-line">
        <span class="pc-persistent-power-icon" aria-hidden="true">🕵️</span>
        <span class="pc-persistent-power-label">Informant</span>
        <span class="pc-persistent-power-value">${value}</span>
      </div>`);
    }
    if (grants.includes("letterProfile")) {
      const stat = window.state?.powers?.letterProfileGuesserStat;
      const statLines = stat && typeof letterProfileLines === "function" ? letterProfileLines(stat) : "";
      lines.push(`<div class="pc-persistent-power-line pc-letter-profile-line">
        <span class="pc-persistent-power-icon" aria-hidden="true">🔤</span>
        <span class="pc-persistent-power-label">Letter Profile</span>
        ${statLines
          ? `<span class="pc-letter-profile-lines">${statLines}</span>`
          : `<span class="pc-persistent-power-pending">—</span>`}
      </div>`);
    }
    return `<article class="pc-persistent-powers">
      <span class="pc-next-kicker">YOUR POWERS</span>
      ${lines.join("")}
    </article>`;
  }

  function renderInspectorPanel(container) {
    const pc = window.state?.powerChoice;
    const inspector = pc?.inspector;
    const pending = pc?.pendingChoice?.role === "guesser";
    const attempts = Number(inspector?.attempts) || 0;
    const hasPreview = !!inspector?.nextQuest;
    const fogged = hasPreview &&
      (Number(pc?.questFogUntilAttempt) || 0) > attempts;
    const next = fogged ? null : inspector?.nextQuest;
    const conditions = questConditionLabels(next);
    const intel = (pc?.inspectorIntel || []).slice(-6);
    const grants = window.state?.powers?.powerChoicePersistentGrants?.guesser || [];
    const signature = JSON.stringify({
      next: next?.id,
      fogged,
      conditions,
      intel: intel.map(item => `${item?.key}:${item?.text}`),
      pending,
      grants,
      peek: window.state?.powers?.revealLocationPeek,
      profileStat: window.state?.powers?.letterProfileGuesserStat
    });
    if (container.dataset.pcSignature === signature) return;
    container.dataset.pcSignature = signature;
    const nextMarkup = fogged
      ? `<article class="pc-next-quest pc-next-quest-fogged">
          <span class="pc-next-kicker">NEXT QUEST</span>
          <p>Preview obscured by Quest Fog until this quest is submitted.</p>
        </article>`
      : next
        ? `<article class="pc-next-quest">
            <span class="pc-next-kicker">NEXT QUEST</span>
            <p>${esc(next.description || "Complete the next condition.")}</p>
            ${conditions.length ? `<ul>${conditions.map(label => `<li>${esc(label)}</li>`).join("")}</ul>` : ""}
          </article>`
        : "";
    const intelMarkup = intel.length
      ? `<article class="pc-intel-panel">
          <span class="pc-next-kicker">REWARD INTEL</span>
          <ul>${intel.map(item => `<li>${esc(item?.text || "")}</li>`).join("")}</ul>
        </article>`
      : "";
    const body = `${persistentPowerMarkup()}${nextMarkup}${intelMarkup}${pending ? `<div class="pc-choice-ready">REWARD CHOICE READY</div>` : ""}`;
    container.innerHTML = body
      ? `<section class="pc-side-panel pc-inspector-panel">${body}</section>`
      : "";
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
    if (host.dataset.pcSignature === signature) return;
    host.dataset.pcSignature = signature;
    // A collapsed-sidebar badge needs to stay small enough to sit next to
    // the toggle button without spilling into the board beside it -- a
    // full 15-segment bar (sized for the open sidebar's full width) can't
    // fit there, so this shows the same number the open sidebar's meter
    // carries instead.
    host.textContent = String(total);
    host.setAttribute("aria-hidden", "false");
    host.setAttribute("aria-label", `Spyometer ${total} of ${SPY_MAX}`);
  }

  // #guesserPowerContainer (the container renderInspectorPanel used to
  // target) is permanently display:none in the current layout -- see
  // persistentPowerMarkup's comment above. This gives the Inspector's
  // panel (next-quest preview, reward intel, and now the persistent-power
  // readouts) an actually-visible home, positioned the same way the quest
  // card's own host is: repositioned every render rather than inserted
  // once, so it stays correctly placed even though renderPanels() (which
  // calls this) runs BEFORE renderCurrentQuest() does in renderAll().
  function ensureInspectorPanelHost() {
    const draftWrap = document.querySelector("#guesserScreen .draft-row-wrap");
    if (!draftWrap) return null;
    let host = byId("pcInspectorPanelHost");
    if (!host) {
      host = document.createElement("section");
      host.id = "pcInspectorPanelHost";
      host.className = "pc-inspector-panel-host";
    }
    const questHost = byId("pcCurrentQuestHost");
    if (questHost && questHost.parentElement) {
      if (questHost.nextElementSibling !== host) {
        questHost.parentElement.insertBefore(host, questHost.nextSibling);
      }
    } else if (host.nextElementSibling !== draftWrap || host.parentElement !== draftWrap.parentElement) {
      draftWrap.parentElement?.insertBefore(host, draftWrap);
    }
    return host;
  }

  function renderPanels() {
    const active = isMode();
    document.body.classList.toggle("power-choice-mode", active);
    if (!active) return;
    const role = myRole();
    const setter = byId("setterPowerContainer");
    if (role === "setter" && setter) renderSpyPanel(setter);
    if (role === "guesser") {
      const guesser = ensureInspectorPanelHost();
      if (guesser) renderInspectorPanel(guesser);
    }
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
      case "ROW_LIMIT":
        return KEYBOARD_ROWS.every(row => [...clean].filter(letter => row.includes(letter)).length <= 2);
      case "ROW_ONLY":
        return KEYBOARD_ROWS.some(row => [...clean].every(letter => row.includes(letter)));
      case "ROW_AVOID":
        return [...clean].every(letter => !String(quest.avoidRow || "").includes(letter));
      case "RARE": return (quest.letters || []).some(letter => clean.includes(cleanWord(letter).slice(0, 1)));
      case "ALPHA": {
        const codes = [...clean].map(letter => letter.charCodeAt(0));
        return codes.every((value, index) => index === 0 || value > codes[index - 1]) ||
          codes.every((value, index) => index === 0 || value < codes[index - 1]);
      }
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
    // Between submitting a guess and the guesser's next turn, draftrow.js
    // hides this row (display:none) rather than clearing its tiles --
    // reading it while hidden would return last round's already-submitted
    // guess instead of the blank draft it visually reads as, which is
    // exactly what let a fresh quest flash "MET" against a leftover word
    // the instant it appeared.
    if (row && row.offsetParent === null) return "";
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
      case "ROW_AVOID":
        letters = [...String(quest.avoidRow || "")];
        label = `avoid ${quest.avoidRow || "that row"}`;
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
    const inspector = state?.powerChoice?.inspector;
    const quest = inspector?.currentQuest;
    const show = isMode(state) && myRole(state) === "guesser" && !!quest;
    if (!host) return;
    host.classList.toggle("hidden", !show);
    if (!show) {
      // No quest to guide anymore -- roles just switched, the match ended,
      // or a new one started. The guide-open/highlight flags are sticky
      // module state, so without this they survived into the next match and
      // the keyboard came back still wearing the old quest's highlights.
      lastQuestId = "";
      questGuideOpen = false;
      questHintsActive = false;
      clearQuestKeyHints();
      currentDraftRow()?.classList.remove("pc-quest-draft-met");
      host.dataset.pcSignature = "";
      return;
    }

    // The quest is only actually attemptable on every other guess (the
    // 2nd, 4th, 6th, ...) -- see the matching questLive gate in
    // evaluateInspectorGuess() server-side. On the guesses in between,
    // show a placeholder instead of a quest that can't be completed yet.
    const attempts = Number(inspector?.attempts) || 0;
    const questLive = attempts % 2 === 1;
    if (!questLive) {
      currentDraftRow()?.classList.remove("pc-quest-draft-met");
      // The most recent LIVE attempt (2nd/4th/6th guess) is what this
      // "waiting" turn's card should reflect -- inspector.lastResult itself
      // gets overwritten every guess including this non-live one, so it
      // can't tell a genuinely-met quest apart from one that wasn't; the
      // server tracks the live outcome separately for exactly this reason
      // (see lastLiveSuccess in powerChoiceServer.js).
      const met = inspector?.lastLiveSuccess === true;
      const placeholderKey = met ? "met" : "pending";
      if (host.dataset.pcSignature !== `pc-quest-placeholder-${placeholderKey}`) {
        host.dataset.pcSignature = `pc-quest-placeholder-${placeholderKey}`;
        host.innerHTML = `<div class="pc-current-quest-card pc-quest-placeholder${met ? " is-met" : ""}">
          <span class="pc-current-main"><strong>${met ? "Quest reward incoming" : "Quest incoming next round"}</strong></span>
        </div>`;
      }
      return;
    }

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
      applyQuestKeyHints();
      return;
    }
    host.dataset.pcSignature = signature;

    host.innerHTML = `<button type="button" class="pc-current-quest-card${met ? " is-met" : ""}" aria-expanded="${questGuideOpen}">
      <span class="pc-current-main">
        <strong>${esc(quest.title || "Quest")}</strong>
        <span class="pc-current-expand">${questGuideOpen ? "Close" : "Rules"}</span>
      <span class="pc-quest-optional-note">Complete for a reward</span></span>
      <span class="pc-current-status" aria-live="polite">${met ? "MET" : ""}</span>
      <span class="pc-current-desc">${esc(quest.description || "Complete the shown condition.")}</span>
      ${conditionLabels.length ? `<span class="pc-current-conditions">${conditionLabels.map((label, index) => `<span class="pc-condition-chip${conditionResults[index] ? " is-met" : ""}">${esc(label)}</span>`).join("")}</span>` : ""}
    </button>
    <div class="pc-quest-guide${questGuideOpen ? " is-open" : ""}">
      <p>${esc(guideCopyForQuest(quest))}</p>
      ${hintSpec ? `<div class="pc-guide-actions">
        ${questHintsActive
          ? `<button type="button" class="pc-guide-clear-btn">Clear highlights</button>`
          : `<button type="button" class="pc-guide-highlight-btn">Highlight ${esc(hintSpec.label)}</button>`}
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
    applyQuestKeyHints();
  }

  function guideCopyForQuest(quest) {
    switch (quest?.type) {
      case "ROW_LIMIT": return "No single keyboard row (top, home, or bottom) may supply more than 2 of your 5 letters.";
      case "ROW_ONLY": return "Every letter must come from the same keyboard row -- top, home, or bottom, whichever you pick.";
      case "ROW_AVOID": return `No letter may come from the ${quest.avoidRow || ""} row.`;
      case "RARE": return `Include at least one of ${quest.letters?.join(", ") || "the listed letters"}.`;
      case "ALPHA": return "All five letters must move strictly forward or strictly backward through the alphabet.";
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

  function setterKeyboardKeys() {
    return [...document.querySelectorAll(
      "#keyboardSetter button, #keyboardSetter [data-key], #keyboardSetter [data-letter], #keyboardSetter .key"
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
      "#draftSetter .draft-hint-letter, " +
      "#draftSetter .setter-bonus-corner-v92"
    ).forEach(element => element.remove());

    // Earlier UI revisions also wrote the bonus letter into data attributes
    // or pseudo-elements. Remove every source from which a corner LETTER
    // can be rendered (the letter itself only shows in the readout above
    // the row, see normalizeBonusTarget) -- the outline is re-applied
    // fresh each render by applyBonusHintTileOutline below, cleared here
    // first so it doesn't linger on a stale tile once the hint moves.
    document.querySelectorAll("#draftSetter .history-tile").forEach(tile => {
      tile.classList.remove(
        "setter-bonus-target-tile-v10",
        "setter-bonus-target-tile-v2",
        "setter-bonus-tile-v92",
        "bonus-target-met-v93",
        "pc-bonus-hint-tile"
      );
      [
        "data-target-letter",
        "data-target-letter-badge",
        "data-bonus-letter",
        "data-hint-letter",
        "data-bonus-letter-v92"
      ].forEach(name => tile.removeAttribute(name));
    });
    document.querySelectorAll("#draftSetter .history-row.setter-bonus-row-v92").forEach(row => {
      row.classList.remove("setter-bonus-row-v92");
      row.style.removeProperty("--setter-bonus-letter-v92");
      row.style.removeProperty("--setter-bonus-label-left-v92");
    });
  }

  // Several older scripts each carry their own copy of this element's
  // creation logic (all inserting it as its own row above the draft, back
  // when it lived there) -- rather than patch every one of them, this
  // takes over WHERE it lives too: create it if none of them got there
  // first, then (re)parent it into the Keep/New row (#setterDecisionMeta)
  // every render, so it ends up on that line regardless of which script's
  // stale insertBefore call ran first.
  function ensureBonusTarget() {
    let target = byId("setterBonusTargetV9");
    if (!target) {
      target = document.createElement("div");
      target.id = "setterBonusTargetV9";
      target.className = "setter-bonus-target-v9 hidden";
    }
    const meta = document.querySelector("#setterScreen #setterDecisionMeta");
    if (meta && target.parentElement !== meta) meta.appendChild(target);
    return target;
  }

  function normalizeBonusTarget() {
    if (!isMode()) return;
    removeSetterTargetLetters();
    const target = ensureBonusTarget();
    if (!target) return;

    target.classList.add("pc-bonus-target-unified");

    const state = window.state;
    const charge = state?.powers?.spyCharge;
    const hint = charge?.hint;
    const letter = cleanWord(hint?.letter).slice(0, 1);
    const positionIndex = Number(hint?.position);
    const show = !!(
      state &&
      window.myRole === "setter" &&
      charge?.enabled &&
      state.phase === "normal" &&
      state.turn === state.setter &&
      state.pendingGuess &&
      !state.powers?.freezeActive &&
      !state.powers?.rouletteSecretActive &&
      !state.simultaneousAllWrong &&
      letter &&
      Number.isInteger(positionIndex) &&
      positionIndex >= 0 &&
      positionIndex <= 4
    );

    target.classList.toggle("hidden", !show);
    if (!show) return;

    const positionLabel = ordinal(positionIndex + 1);
    const signature = `${letter}:${positionIndex}`;
    const currentLetter = target.querySelector(".setter-bonus-letter-chip-v2")?.textContent;
    const currentCopy = target.querySelector(".setter-bonus-position-copy-v2")?.textContent;
    if (
      target.dataset.pcBonusSignature !== signature ||
      currentLetter !== letter ||
      currentCopy !== `: ${positionLabel}`
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
      copy.textContent = `: ${positionLabel}`;

      position.append(chip, copy);
      target.replaceChildren(plus, position);
      target.dataset.pcBonusSignature = signature;
    }
    const satisfied = !!window.__setterBonusEarned;
    target.classList.toggle("pc-bonus-satisfied", satisfied);
    target.setAttribute(
      "aria-label",
      `Bonus star: ${letter} in ${positionLabel}${satisfied ? " -- earned" : ""}`
    );

    applyBonusHintTileOutline(positionIndex);
  }

  // The draft tile at the hint's position gets an outline in the same
  // light blue as the bonus star readout above it, so the two visibly
  // read as one hint instead of the tile looking unrelated to the pill.
  function applyBonusHintTileOutline(positionIndex) {
    const draft = byId("draftSetter");
    const row = draft?.__draftRows?.draft ||
      draft?.querySelector(".history-row.setter-draft, .history-row.ghost-secret");
    const tiles = row?.__tiles || row?.querySelectorAll?.(":scope > .history-tile");
    if (!tiles) return;
    [...tiles].forEach((tile, index) => {
      tile.classList.toggle("pc-bonus-hint-tile", index === positionIndex);
    });
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
      <button type="button" class="pc-modal-peek" title="Look at the board -- your reward stays waiting">Hide</button>
      <h2></h2>
      <p class="pc-modal-sub"></p>
      <div class="pc-card-grid"></div>
    </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  // Shown while the modal is peeked away, so the reward is never lost --
  // it is the only way back, and the turn stays blocked until a card is
  // picked (the server rejects guesses/secrets while a choice is pending).
  function ensurePeekBar() {
    let bar = byId("pcRewardPeekBar");
    if (bar) return bar;
    bar = document.createElement("button");
    bar.type = "button";
    bar.id = "pcRewardPeekBar";
    bar.className = "pc-reward-peek-bar";
    bar.innerHTML = `<span aria-hidden="true">★</span> Reward waiting — tap to choose`;
    bar.addEventListener("click", () => {
      const modal = byId("powerChoiceModal");
      if (!modal) return;
      modal.classList.remove("is-peeking");
      bar.classList.remove("is-visible");
      modal.querySelector(".pc-choice-card")?.focus();
    });
    document.body.appendChild(bar);
    return bar;
  }

  // The real in-game icon for a power (same <symbol> library the power
  // buttons use), falling back to the option's own glyph for the fixed
  // (non-power) rewards that have no icon of their own.
  function optionIconMarkup(option) {
    const iconId = option?.kind === "power"
      ? window.POWER_ICON_IDS?.[option.powerId]
      : null;
    if (iconId) {
      return `<svg class="power-icon pc-card-svg" viewBox="0 0 120 120" aria-hidden="true">
        <use href="#${esc(iconId)}" xlink:href="#${esc(iconId)}"></use>
      </svg>`;
    }
    if (option?.kind === "power") {
      return esc(window.POWER_METADATA?.[option.powerId]?.emoji || option.icon || "⚡");
    }
    return esc(option?.icon || "◆");
  }

  // Reward cards have room for the full explanation, so prefer a power's
  // long description over the terse one the compact badges use.
  function optionDescription(option) {
    if (option?.kind === "power") {
      const meta = window.POWER_METADATA?.[option.powerId];
      return meta?.desc || meta?.short || option.description || "";
    }
    return option?.description || "";
  }

  function showQuestMetFlourish() {
    let el = byId("pcQuestMetFlourish");
    if (!el) {
      el = document.createElement("div");
      el.id = "pcQuestMetFlourish";
      el.className = "pc-quest-met-flourish";
      el.innerHTML = `<span class="pc-quest-met-star" aria-hidden="true">&#9733;</span><span>QUEST MET</span>`;
      document.body.appendChild(el);
    }
    el.classList.remove("is-visible");
    void el.offsetWidth;
    el.classList.add("is-visible");
  }

  function openRewardModal(pending) {
    const modal = ensureChoiceModal();
    modal.dataset.choiceId = pending.id;
    modal.querySelector("h2").textContent = pending.title || "Choose a reward";
    modal.querySelector(".pc-modal-sub").textContent =
      pending.subtitle || "Choose one card. It activates immediately.";
    const grid = modal.querySelector(".pc-card-grid");
    const rewardCardIconMarkup = option => {
      if (typeof optionIconMarkup === "function") return optionIconMarkup(option);
      if (typeof optionIcon === "function") return esc(optionIcon(option));
      if (option?.kind === "power") {
        return esc(window.POWER_METADATA?.[option.powerId]?.emoji || option.icon || "⚡");
      }
      return esc(option?.icon || "◆");
    };
    const rewardCardDescription = option => {
      if (typeof optionDescription === "function") return optionDescription(option);
      if (option?.kind === "power") {
        const meta = window.POWER_METADATA?.[option.powerId];
        return meta?.desc || meta?.short || option.description || "";
      }
      return option?.description || "";
    };
    grid.innerHTML = (pending.options || []).map(option => {
      const tierNumber =
        option.tier ||
        (option.kind === "power"
          ? window.POWER_TIERS?.[option.powerId]?.tier || 1
          : pending.tier || null);
      const tier = tierNumber
        ? `<span class="pc-tier" data-tier="${esc(tierNumber)}">TIER ${esc(tierNumber)}</span>`
        : "";
      const explanation = option.explanation
        ? `<span class="pc-card-explanation">${esc(option.explanation)}</span>`
        : "";
      const accent = option.kind === "power"
        ? (window.POWER_METADATA?.[option.powerId]?.color || "")
        : "";
      const style = accent ? ` style="--pc-card-accent:${esc(accent)}"` : "";
      return `<button type="button" class="pc-choice-card" data-option-id="${esc(option.id)}"${style}>
        <span class="pc-card-icon">${rewardCardIconMarkup(option)}</span>
        ${tier}
        <strong>${esc(option.title)}</strong>
        <span class="pc-card-desc">${esc(rewardCardDescription(option))}</span>
        ${explanation}
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
    const peekBar = typeof ensurePeekBar === "function" ? ensurePeekBar() : null;
    const peekBtn = modal.querySelector(".pc-modal-peek");
    if (peekBtn && !peekBtn.dataset.wired) {
      peekBtn.dataset.wired = "1";
      peekBtn.addEventListener("click", event => {
        event.stopPropagation();
        modal.classList.add("is-peeking");
        byId("pcRewardPeekBar")?.classList.add("is-visible");
      });
    }
    modal.classList.remove("is-peeking");
    peekBar?.classList.remove("is-visible");
    modal.classList.add("is-open");
    grid.querySelector("button")?.focus();
  }

  function showChoice() {
    const modal = ensureChoiceModal();
    const pending = window.state?.powerChoice?.pendingChoice;
    if (!isMode() || !pending || pending.ownerUserId !== me()) {
      modal.classList.remove("is-open", "is-peeking");
      byId("pcRewardPeekBar")?.classList.remove("is-visible");
      modal.dataset.choiceId = "";
      if (rewardModalTimer) {
        clearTimeout(rewardModalTimer);
        rewardModalTimer = null;
      }
      rewardModalPendingId = "";
      return;
    }
    if (modal.dataset.choiceId === pending.id && modal.classList.contains("is-open")) return;
    if (rewardModalPendingId === pending.id) return;
    rewardModalPendingId = pending.id;
    if (pending.role === "guesser") showQuestMetFlourish();

    rewardModalTimer = setTimeout(() => {
      rewardModalTimer = null;
      if (window.state?.powerChoice?.pendingChoice?.id === pending.id) {
        openRewardModal(pending);
      }
    }, REWARD_MODAL_SETTLE_MS);
  }

  function markEliminatedKeys() {
    const eliminated = new Set(window.state?.powerChoice?.eliminatedLetters || []);
    const ruledOut = new Set(window.state?.powerChoice?.ruledOutLetters || []);
    keyboardKeys().forEach(key => {
      const letter = keyboardLetter(key);
      const blocked = !!letter && eliminated.has(letter);
      const informational = !!letter && !blocked && ruledOut.has(letter);
      key.classList.toggle("pc-key-eliminated", blocked);
      key.classList.toggle("pc-key-ruled-out", informational);
      key.setAttribute("aria-disabled", blocked ? "true" : "false");
      if (blocked) key.title = `${letter} was ruled out and locked`;
      else if (informational) key.title = `${letter} is confirmed absent`;
      else if (key.title?.includes("confirmed absent") || key.title?.includes("ruled out and locked")) key.removeAttribute("title");
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

  function captureSetterSourceRect() {
    const bonus = byId("setterBonusTargetV9");
    if (bonus && !bonus.classList.contains("hidden")) return bonus.getBoundingClientRect();
    const row = byId("draftSetter")?.__draftRows?.draft || document.querySelector("#draftSetter .history-row.setter-draft");
    return row?.getBoundingClientRect() || null;
  }

  function spyAwardTarget() {
    const id = setterSidebarCollapsed() ? "setterSidebarChargeMini" : "pcSpyMeter";
    return byId(id) || byId("pcSpyMeter") || byId("setterSidebarChargeMini");
  }

  function capsuleMeter(capsule, value, bonusFrom = Infinity) {
    const meter = capsule.querySelector(".pc-award-capsule-meter");
    if (!meter) return;
    meter.innerHTML = Array.from({ length: SPY_MAX }, (_, index) => {
      const number = index + 1;
      const classes = ["pc-award-capsule-segment"];
      if (number <= value) classes.push("is-filled");
      if (number >= bonusFrom && number <= value) classes.push("is-bonus");
      if ([5, 9, 15].includes(number)) classes.push("is-milestone");
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
      // A single star actually making the trip from the capsule to the
      // real meter -- the capsule itself used to be what flew over
      // (shrinking down into the target), which read as a card sliding
      // and shrinking rather than "a star shooting into the bar." The
      // capsule now just fades in place while a dedicated comet-styled
      // star (same look pc-award-falling-star already uses for the stars
      // landing in the capsule's own mini-meter) makes that final leg,
      // with a slight upward bow at the midpoint so it reads as a
      // trajectory landing in the bar rather than a straight slide.
      const capsuleRect = capsule.getBoundingClientRect();
      const startX = capsuleRect.left + capsuleRect.width / 2;
      const startY = capsuleRect.top + capsuleRect.height / 2;
      const endX = targetRect.left + targetRect.width / 2;
      const endY = targetRect.top + targetRect.height / 2;
      const dx = endX - startX;
      const dy = endY - startY;

      const shootingStar = document.createElement("span");
      shootingStar.className = "pc-award-shooting-star";
      shootingStar.textContent = "★";
      shootingStar.style.left = `${startX}px`;
      shootingStar.style.top = `${startY}px`;
      document.body.appendChild(shootingStar);

      const capsuleFade = capsule.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 200, easing: "ease-out", fill: "forwards" }
      );

      const flight = shootingStar.animate([
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 46}px)) scale(.85)`,
          opacity: 1,
          offset: 0.55
        },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.3)`, opacity: 0.9 }
      ], { duration: 520, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" });

      try { await Promise.all([flight.finished, capsuleFade.finished]); } catch {}
      shootingStar.remove();
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
    clearTimeout(deferredHistoryTimer);
    deferredHistoryTimer = null;
    const releases = deferredSetterHistory.splice(0);
    releases.forEach(release => {
      try { requestAnimationFrame(release); } catch {}
    });
  }

  // Holds the submitted row until the star sequence is genuinely over, so
  // the two never play at once: while an award is queued or running this
  // keeps re-checking (drainSpyAwardQueue's own flush normally wins), and
  // if no award ever shows up it releases the row once the grace window
  // for a late-arriving spyChargeAward has passed.
  function scheduleDeferredHistoryFlush() {
    clearTimeout(deferredHistoryTimer);
    const waitingSince = Date.now();

    const tick = () => {
      if (!deferredSetterHistory.length) {
        deferredHistoryTimer = null;
        return;
      }
      if (spyAwardRunning || spyAwardQueue.length) {
        deferredHistoryTimer = setTimeout(tick, 120);
        return;
      }
      // An award just finished -- let its last landing settle before the
      // row moves, instead of cutting straight from one to the other.
      const sinceAward = Date.now() - lastSpyAwardFinishedAt;
      if (lastSpyAwardFinishedAt && sinceAward < AWARD_SETTLE_MS) {
        deferredHistoryTimer = setTimeout(tick, AWARD_SETTLE_MS - sinceAward);
        return;
      }
      if (Date.now() - waitingSince < AWARD_ARRIVAL_GRACE_MS) {
        deferredHistoryTimer = setTimeout(tick, 40);
        return;
      }
      flushDeferredSetterHistory();
    };

    deferredHistoryTimer = setTimeout(tick, 40);
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
      // scheduleDeferredHistoryFlush's tick is what actually releases the
      // row (it applies AWARD_SETTLE_MS); this just makes sure a tick is
      // pending even if the row was handed over before any award arrived.
      scheduleDeferredHistoryFlush();
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
      // Always take the row, never release it inline. Deciding here off
      // "is an award running right now" was the bug: on the stateUpdate-
      // first ordering nothing was running yet, the row was handed straight
      // back, and it flew while the stars were still in the air.
      // scheduleDeferredHistoryFlush owns the timing from here.
      deferredSetterHistory.push(release);
      scheduleDeferredHistoryFlush();
      return true;
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

  // Several pre-Power-Choice scripts (collapsed-actions-v9.js,
  // v9-2-ui-fixes.js, v9-3-ui-fixes.js) each build their own floating
  // "collapsed charge toast" -- a 12-segment meter + "N/12" + "+N" delta,
  // and sometimes a power glyph -- off the same spyCharge state this mode
  // drives. Power Choice has its own Spyometer and award capsule for that,
  // so the toast is pure duplicate chrome here. Neutralize the shared
  // entry point they all publish and drop anything already on screen.
  function suppressLegacyChargeToasts() {
    if (!window.__pcChargeToastSuppressed) {
      window.__pcChargeToastSuppressed = true;
      const original = window.showCollapsedChargeToast;
      window.showCollapsedChargeToast = function (...args) {
        if (isMode()) return;
        return original?.apply(this, args);
      };
    }
    if (!isMode()) return;
    document
      .querySelectorAll(".collapsed-charge-toast")
      .forEach(node => node.remove());
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
    suppressLegacyChargeToasts();
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
