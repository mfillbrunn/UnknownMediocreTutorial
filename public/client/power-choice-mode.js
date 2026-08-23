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
  // Recon Sweep / Miss Bet / Double Tap fire immediately on pick, but need
  // real input (5 letters / a bet number / two words) the reward system
  // has no other way to collect -- picking one of these three cards swaps
  // that one card's own content for a small input form instead of sending
  // POWER_CHOICE_SELECT right away (see renderRewardChoiceCards). There's
  // no way to bank the power for later: cancelling or picking a different
  // card just discards whatever was typed.
  let rewardInputArmed = null; // {choiceId, optionId, powerId} | null

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
  // PERSISTENT_POWER_IDS server-side): a compact "Lock a letter" button.
  // The server now picks the banned letter itself (see pickLockoutLetter
  // in letterLockoutServer.js -- random, never repeats, prefers a letter
  // that's never been guessed at all), so there's no letter for the
  // player to choose here -- just a direct fire-with-confirmation, unlike
  // the arm-then-tap-a-keyboard-letter flow Hide Evidence uses.
  function letterLockoutGranted() {
    // activePowers is already filtered server-side to whichever player
    // currently holds the setter seat (see powerChoiceServer.js's
    // initializeRound) -- a role swap that hands the seat to someone who
    // never earned the grant correctly reads as not-granted here.
    return !!window.state?.activePowers?.includes("letterLockout");
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

  function fireLetterLockout() {
    if (!canArmLetterLockout()) return;

    const submit = () => {
      // Must match the action type powerEngine/powers/letterLockout.js's
      // own modal sends -- normal.js's generic USE_ handler derives the
      // powerId straight from action.type (normalizePowerId), it isn't
      // read from a separate field. No letter is sent -- the server picks
      // it (see letterLockoutServer.js's apply()).
      window.sendGameAction?.({ type: "USE_LETTER_LOCKOUT", role: "setter" });
    };

    if (typeof window.showPowerActionPopup === "function") {
      window.showPowerActionPopup({
        emoji: window.POWER_METADATA?.letterLockout?.emoji || "🚫",
        title: "Lock a letter?",
        desc: "Bans a random letter the Guesser hasn't tried yet from their next guess. Once picked, that letter can never be banned again this match.",
        useLabel: "Lock a letter",
        showUse: true,
        useEnabled: true,
        onUse: submit
      });
    } else if (window.confirm("Ban a random untried letter from the Guesser's next guess?")) {
      submit();
    }
  }

  function renderSpyPanel(container) {
    const total = spyDisplayTotal();
    const pending = window.state?.powerChoice?.pendingChoice?.role === "setter";
    const detailsOpen = container.dataset.pcDetailsOpen === "true";
    const lockoutGranted = letterLockoutGranted();
    const lockoutArmable = canArmLetterLockout();
    const bannedLetter = window.state?.powers?.letterLockoutBanned || "";
    const signature = [total, pending, detailsOpen, lockoutGranted, lockoutArmable, bannedLetter].join("|");
    if (container.dataset.pcSignature === signature) return;
    container.dataset.pcSignature = signature;
    const lockoutMarkup = lockoutGranted
      ? `<button type="button" id="pcLetterLockoutBtn"
          class="pc-letter-lockout-btn"
          ${lockoutArmable ? "" : "disabled"}>
          <span aria-hidden="true">🚫</span>
          ${bannedLetter ? `${esc(bannedLetter)} banned this guess` : "Lock a letter"}
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
          <span><b>5</b> choose 1 reward</span>
          <span><b>9</b> choose 1 reward</span>
          <span><b>15</b> choose 2 rewards</span>
        </div>
      </div>
      ${lockoutMarkup}

    </section>`;
    byId("pcSpyChargeCard")?.addEventListener("click", () => {
      container.dataset.pcDetailsOpen = detailsOpen ? "false" : "true";
      container.dataset.pcSignature = "";
      renderSpyPanel(container);
    });
    byId("pcLetterLockoutBtn")?.addEventListener("click", fireLetterLockout);
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
    // activePowers is already filtered server-side to whichever player
    // currently holds the guesser seat (see powerChoiceServer.js's
    // initializeRound) -- a role swap that hands the seat to someone who
    // never earned the grant correctly drops these lines for them.
    const grants = window.state?.activePowers || [];
    const relevant = grants.filter(id => id === "revealLocation" || id === "letterProfile");
    if (!relevant.length) return "";
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
      const value = Number.isInteger(stat?.vowels) ? String(stat.vowels) : null;
      lines.push(`<div class="pc-persistent-power-line pc-letter-profile-line">
        <span class="pc-persistent-power-icon" aria-hidden="true">🔤</span>
        <span class="pc-persistent-power-label">Secret Vowel Count</span>
        ${value !== null
          ? `<span class="pc-persistent-power-value">${esc(value)}</span>`
          : `<span class="pc-persistent-power-pending">—</span>`}
      </div>`);
    }
    return `<article class="pc-persistent-powers">
      <span class="pc-next-kicker">YOUR POWERS</span>
      ${lines.join("")}
    </article>`;
  }

  // Recon Sweep / Miss Bet / Double Tap, once unlocked as persistent
  function renderInspectorPanel(container) {
    const pc = window.state?.powerChoice;
    const inspector = pc?.inspector;
    const pending = pc?.pendingChoice?.role === "guesser";
    const next = inspector?.nextQuest;
    const conditions = questConditionLabels(next);
    const grants = window.state?.activePowers || [];
    const signature = JSON.stringify({
      next: next?.id,
      conditions,
      pending,
      grants,
      peek: window.state?.powers?.revealLocationPeek,
      profileStat: window.state?.powers?.letterProfileGuesserStat
    });
    if (container.dataset.pcSignature === signature) return;
    container.dataset.pcSignature = signature;
    const nextMarkup = next
      ? `<article class="pc-next-quest">
          <span class="pc-next-kicker">NEXT QUEST</span>
          <p>${esc(next.description || "Complete the next condition.")}</p>
          ${conditions.length ? `<ul>${conditions.map(label => `<li>${esc(label)}</li>`).join("")}</ul>` : ""}
        </article>`
      : "";
    const body = `${persistentPowerMarkup()}${nextMarkup}`;
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
  // persistentPowerMarkup's comment above. This gives the Guesser's
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

    // A fresh quest object (even one not "live" yet, see below) means any
    // guide the guesser left on for the PREVIOUS quest no longer applies --
    // reset it here, before the not-live branch can return early, so a
    // leftover "on" guide doesn't keep highlighting keys against the new
    // quest during its placeholder window (it used to only clear once the
    // new quest went live, which read as the guide already being active
    // for a quest that hadn't started yet).
    if (quest.id !== lastQuestId) {
      lastQuestId = quest.id || "";
      questGuideOpen = false;
      questHintsActive = false;
      clearQuestKeyHints();
    }

    // The quest is only actually attemptable on every other guess (the
    // 2nd, 4th, 6th, ...) -- see the matching questLive gate in
    // evaluateInspectorGuess() server-side. On the guesses in between,
    // show a placeholder instead of a quest that can't be completed yet.
    const attempts = Number(inspector?.attempts) || 0;
    const questLive = attempts % 2 === 1;
    if (!questLive) {
      currentDraftRow()?.classList.remove("pc-quest-draft-met");
      const placeholderKey = "pending";
      if (host.dataset.pcSignature !== `pc-quest-placeholder-${placeholderKey}`) {
        host.dataset.pcSignature = `pc-quest-placeholder-${placeholderKey}`;
        host.innerHTML = `<div class="pc-current-quest-card pc-quest-placeholder">
          <span class="pc-current-main"><strong>Quest incoming next round</strong></span>
        </div>`;
      }
      return;
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
      <span class="pc-quest-optional-note">Optional -- complete for a reward</span></span>
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
    // Hierarchy is exactly: heading / "Select one" / cards / one Refresh
    // choices action below the cards -- no toolbar, no duplicate reroll,
    // no competing top-level instruction (see REFINEMENT_SPEC section 4).
    modal.innerHTML = `<div class="pc-modal-card">
      <button type="button" class="pc-modal-peek" title="Look at the board -- your reward stays waiting">Hide</button>
      <h2></h2>
      <p class="pc-modal-sub">Select one</p>
      <div class="pc-card-grid"></div>
      <button type="button" class="pc-refresh-choice-btn" title="Refresh reward choices" aria-label="Refresh reward choices">
        <span class="pc-refresh-icon" aria-hidden="true">&#8635;</span>
        <span class="pc-refresh-label">Refresh choices</span>
        <span class="pc-refresh-state" aria-live="polite">READY</span>
      </button>
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
    bar.innerHTML = `<span aria-hidden="true">★</span> Reward waiting — tap to select`;
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
  // POWER CHOICE CARD CAROUSEL V1: CLIENT START

  function fixedRewardIconMarkup(option) {
    const id = String(option?.id || "");
    if (id === "spy-add-point-1") {
      return `<svg class="pc-card-svg pc-fixed-reward-svg" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="61" r="43" fill="#4c1d3f" stroke="#fb7185" stroke-width="6"/>
        <path d="M88 39l8-16 8 16-8-4z" fill="#fbbf24"/>
        <text x="60" y="73" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="39" font-weight="900">+1</text>
        <path d="M28 34l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#60a5fa"/>
      </svg>`;
    }
    if (id === "inspector-yellow-1") {
      return `<svg class="pc-card-svg pc-fixed-reward-svg" viewBox="0 0 120 120" aria-hidden="true">
        <rect x="24" y="19" width="72" height="82" rx="16" fill="#facc15" stroke="#fef3c7" stroke-width="6"/>
        <path d="M39 60c12-18 30-18 42 0-12 18-30 18-42 0z" fill="#0f172a" opacity=".9"/>
        <circle cx="60" cy="60" r="10" fill="#e0f2fe"/>
        <circle cx="60" cy="60" r="4" fill="#2563eb"/>
        <path d="M91 18v16M83 26h16" stroke="#f472b6" stroke-width="5" stroke-linecap="round"/>
      </svg>`;
    }
    if (id === "inspector-remove-point-1") {
      return `<svg class="pc-card-svg pc-fixed-reward-svg" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M60 13l39 15v27c0 25-15 43-39 54C36 98 21 80 21 55V28z" fill="#0f766e" stroke="#5eead4" stroke-width="6"/>
        <circle cx="60" cy="58" r="28" fill="#082f49" stroke="#7dd3fc" stroke-width="4"/>
        <text x="60" y="69" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="30" font-weight="900">−1</text>
        <path d="M84 23l5 9 10 2-7 7 2 10-10-5-9 5 2-10-7-7 10-2z" fill="#fbbf24"/>
      </svg>`;
    }
    if (option?.kind === "fixed") {
      const spy = id.startsWith("spy-");
      const outer = spy ? "#fb7185" : "#38bdf8";
      const inner = spy ? "#4c1d3f" : "#0c4a6e";
      // No wavy accent line across the badge (used to run stroke="#fbbf24"
      // through the middle here) -- it cut straight across the option's
      // own glyph/text at this size and made the icon harder to read than
      // the plain background alone.
      return `<svg class="pc-card-svg pc-fixed-reward-svg" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="45" fill="${inner}" stroke="${outer}" stroke-width="6"/>
        <circle cx="25" cy="30" r="7" fill="#34d399"/>
        <circle cx="96" cy="28" r="8" fill="#a78bfa"/>
        <text x="60" y="67" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="25" font-weight="900">${esc(option.icon || "◆")}</text>
      </svg>`;
    }
    return "";
  }

  function optionIconMarkup(option) {
    const fixed = fixedRewardIconMarkup(option);
    if (fixed) return fixed;
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

  function wireRewardCarousel(grid) {
    if (!grid || grid.dataset.pcCarouselWired === "1") return;
    grid.dataset.pcCarouselWired = "1";
    grid.addEventListener("wheel", event => {
      if (grid.scrollWidth <= grid.clientWidth + 1) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      if (!delta) return;
      const atStart = grid.scrollLeft <= 1;
      const atEnd = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 1;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
      event.preventDefault();
      grid.scrollLeft += delta;
    }, { passive: false });
    grid.addEventListener("keydown", event => {
      const isNext = event.key === "ArrowRight" || event.key === "ArrowDown";
      const isPrev = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (!isNext && !isPrev) return;
      // Don't hijack cursor movement while the player is typing into one
      // of the reward-input cards' own text fields (see rewardInputArmed).
      if (event.target?.tagName === "INPUT") return;
      const cards = [...grid.querySelectorAll(".pc-choice-card")];
      const current = Math.max(0, cards.indexOf(document.activeElement));
      const direction = isNext ? 1 : -1;
      const next = cards[Math.max(0, Math.min(cards.length - 1, current + direction))];
      if (!next || next === document.activeElement) return;
      event.preventDefault();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  // Cards whose reward fires with real player-typed input instead of
  // immediately on click -- see rewardInputArmed above.
  const REWARD_INPUT_POWER_IDS = new Set(["betMiss", "doubleGuess"]);

  // The armed card's own content, swapped in for its normal icon/title/
  // description while the player is entering input. cleanWord() (top of
  // file) already restricts typing to A-Z and caps length at 5.
  function rewardInputFormMarkup(option) {
    if (option.powerId === "betMiss") {
      const buttons = [0, 1, 2, 3, 4, 5]
        .map(n => `<button type="button" class="pc-reward-bet-btn" data-value="${n}">${n}</button>`)
        .join("");
      return `<div class="pc-reward-input-form">
        <span class="pc-reward-input-label">Bet how many misses:</span>
        <div class="pc-reward-bet-row">${buttons}</div>
        <div class="pc-reward-input-actions">
          <button type="button" class="pc-reward-fire-btn" disabled>Bet</button>
          <button type="button" class="pc-reward-cancel-btn">Cancel</button>
        </div>
      </div>`;
    }
    // doubleGuess
    return `<div class="pc-reward-input-form">
      <span class="pc-reward-input-label">Type both guesses:</span>
      <input type="text" class="pc-reward-word-input" data-slot="0" maxlength="5" placeholder="GUESS 1" autocomplete="off" autocapitalize="characters">
      <input type="text" class="pc-reward-word-input" data-slot="1" maxlength="5" placeholder="GUESS 2" autocomplete="off" autocapitalize="characters">
      <div class="pc-reward-input-actions">
        <button type="button" class="pc-reward-fire-btn" disabled>Fire</button>
        <button type="button" class="pc-reward-cancel-btn">Cancel</button>
      </div>
    </div>`;
  }

  // Reward category -> icon-rail color. The category itself is computed
  // once, server-side, in server/power-choice/rewardCategories.js and sent
  // on every option -- this is presentation only, never a second place
  // that infers a category from an id or display text.
  const REWARD_CATEGORY_COLORS = {
    information: "#60a5fa",
    "letter-control": "#a78bfa",
    "feedback-disruption": "#fb7185",
    "constraint-defense": "#2dd4bf",
    "choice-tempo": "#fbbf24",
    utility: "#94a3b8"
  };

  function rewardCategoryColor(option) {
    return REWARD_CATEGORY_COLORS[option?.category] || REWARD_CATEGORY_COLORS.utility;
  }

  // POWER CHOICE RARITY + REFRESH V1: CLIENT START
  function rewardRarityMeta(option, pending) {
    const rawTier = Number(
      option?.rarityTier ||
      option?.tier ||
      (option?.kind === "power" ? window.POWER_TIERS?.[option.powerId]?.tier : 1) ||
      1
    );
    const tier = rawTier === 3 ? 3 : rawTier === 2 ? 2 : 1;
    if (tier === 3) return { tier, key: "legend", label: "LEGEND", metal: "GOLD" };
    if (tier === 2) return { tier, key: "rare", label: "RARE", metal: "SILVER" };
    return { tier, key: "common", label: "COMMON", metal: "BRONZE" };
  }

  function renderRewardChoiceCards(pending, grid) {
    const options = Array.isArray(pending?.options) ? pending.options : [];
    if (rewardInputArmed && rewardInputArmed.choiceId !== pending.id) rewardInputArmed = null;
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Reward choices, listed top to bottom.");
    grid.innerHTML = options.map(option => {
      const armed = rewardInputArmed?.optionId === option.id;
      const rarity = rewardRarityMeta(option, pending);
      // Rarity is communicated by color only (data-rarity below); no
      // visible COMMON/RARE/LEGEND text on the card, only in the aria-label.
      const description = typeof optionDescription === "function"
        ? optionDescription(option)
        : option?.description || "";
      // Left 25% icon rail = reward category color. Right 75% description
      // area = rarity color (handled purely by the data-rarity CSS below).
      const categoryColor = rewardCategoryColor(option);
      const style = ` style="--pc-power-accent:${esc(categoryColor)};--pc-card-accent:${esc(categoryColor)}"`;
      const ariaLabel = `${option.title || "Reward"}. ${rarity.label} reward. ${description}`;
      if (armed) {
        return `<div class="pc-choice-card pc-choice-card-armed" role="group" aria-label="${esc(ariaLabel)}" data-option-id="${esc(option.id)}" data-rarity="${esc(rarity.key)}"${style}>
          <span class="pc-card-icon">${optionIconMarkup(option)}</span>
          <div class="pc-card-body pc-card-body-armed">
            <strong>${esc(option.title)}</strong>
            ${rewardInputFormMarkup(option)}
          </div>
        </div>`;
      }
      return `<button type="button" class="pc-choice-card" aria-label="${esc(ariaLabel)}" data-option-id="${esc(option.id)}" data-rarity="${esc(rarity.key)}"${style}>
        <span class="pc-card-icon">${optionIconMarkup(option)}</span>
        <span class="pc-card-body">
          <strong>${esc(option.title)}</strong>
          <span class="pc-card-desc">${esc(description)}</span>
        </span>
      </button>`;
    }).join("");

    function fireChoice(optionId, payload) {
      rewardInputArmed = null;
      grid.querySelectorAll("button").forEach(item => { item.disabled = true; });
      window.sendGameAction?.({
        type: "POWER_CHOICE_SELECT",
        userId: me(),
        choiceId: pending.id,
        optionId,
        ...payload
      });
    }

    grid.querySelectorAll(".pc-choice-card:not(.pc-choice-card-armed)").forEach(button => {
      button.addEventListener("click", () => {
        if (button.disabled) return;
        const option = options.find(item => item.id === button.dataset.optionId);
        if (option && REWARD_INPUT_POWER_IDS.has(option.powerId)) {
          rewardInputArmed = { choiceId: pending.id, optionId: option.id, powerId: option.powerId };
          renderRewardChoiceCards(pending, grid);
          return;
        }
        fireChoice(button.dataset.optionId);
      });
    });

    const armedCard = grid.querySelector(".pc-choice-card-armed");
    if (armedCard) {
      const optionId = armedCard.dataset.optionId;
      const wordInputs = [...armedCard.querySelectorAll(".pc-reward-word-input")];
      const fireBtn = armedCard.querySelector(".pc-reward-fire-btn");
      const cancelBtn = armedCard.querySelector(".pc-reward-cancel-btn");
      let betValue = null;

      const updateFireEnabled = () => {
        if (!fireBtn) return;
        if (rewardInputArmed?.powerId === "betMiss") {
          fireBtn.disabled = betValue == null;
        } else {
          fireBtn.disabled = wordInputs.some(input => cleanWord(input.value).length !== 5);
        }
      };

      wordInputs.forEach(input => {
        input.addEventListener("input", () => {
          const clean = cleanWord(input.value);
          if (input.value !== clean) input.value = clean;
          updateFireEnabled();
        });
      });
      if (wordInputs[0]) wordInputs[0].focus();

      armedCard.querySelectorAll(".pc-reward-bet-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          betValue = Number(btn.dataset.value);
          armedCard.querySelectorAll(".pc-reward-bet-btn").forEach(item => {
            item.classList.toggle("is-selected", item === btn);
          });
          updateFireEnabled();
        });
      });

      cancelBtn?.addEventListener("click", () => {
        rewardInputArmed = null;
        renderRewardChoiceCards(pending, grid);
      });

      fireBtn?.addEventListener("click", () => {
        if (fireBtn.disabled) return;
        if (rewardInputArmed?.powerId === "betMiss") {
          fireChoice(optionId, { betMissNumber: betValue });
        } else if (rewardInputArmed?.powerId === "doubleGuess") {
          fireChoice(optionId, { guess1: wordInputs[0].value, guess2: wordInputs[1].value });
        }
      });

      updateFireEnabled();
    }

    wireRewardCarousel(grid);
    grid.scrollLeft = 0;
  }
  // POWER CHOICE CARD CAROUSEL V1: CLIENT END

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
    // Uses the app's shared announcement component (see big-announce.js)
    // instead of a bespoke popup, so this brief pre-reward-modal beat
    // stays consistent with every other transient notice in the app.
    window.showBigAnnounce?.({
      icon: "★",
      title: "Quest met — reward incoming",
      roleClass: "role-guesser",
      compact: true,
      duration: 1300
    });
  }

  function openRewardModal(pending) {
    const modal = ensureChoiceModal();
    modal.dataset.choiceId = pending.id;
    modal.dataset.choiceRevision = String(pending.revision || 0);
    modal.dataset.rewardRole = pending.role || "";
    // Exact required heading per role -- Quests are the Guesser bonus,
    // Stars are the Secretkeeper bonus (see the rules screen), so each
    // role's reward chooser names its own source instead of a generic
    // "Select a reward" that doesn't say where the reward came from.
    modal.querySelector("h2").textContent = pending.role === "setter" ? "Star reward" : "Quest reward";

    const refreshBtn = modal.querySelector(".pc-refresh-choice-btn");
    const refreshAvailable = pending.refreshAvailable !== false;
    if (refreshBtn) {
      refreshBtn.disabled = !refreshAvailable;
      refreshBtn.classList.toggle("is-spent", !refreshAvailable);
      refreshBtn.classList.remove("is-dealing");
      refreshBtn.setAttribute("aria-busy", "false");
      const refreshLabel = refreshBtn.querySelector(".pc-refresh-label");
      const refreshState = refreshBtn.querySelector(".pc-refresh-state");
      if (refreshLabel) refreshLabel.textContent = refreshAvailable ? "Refresh choices" : "Refresh used";
      if (refreshState) refreshState.textContent = refreshAvailable ? "READY" : "USED";
      refreshBtn.title = refreshAvailable ? "Refresh reward choices" : "Refresh already used";
      refreshBtn.setAttribute(
        "aria-label",
        refreshAvailable ? "Refresh reward choices" : "Refresh already used"
      );
      if (!refreshBtn.dataset.wired) {
        refreshBtn.dataset.wired = "1";
        refreshBtn.addEventListener("click", event => {
          event.stopPropagation();
          const current = window.state?.powerChoice?.pendingChoice;
          if (!current || current.id !== modal.dataset.choiceId || refreshBtn.disabled) return;
          // Disarm payload-entry cards before replacing the offer.
          rewardInputArmed = null;
          refreshBtn.disabled = true;
          refreshBtn.classList.add("is-dealing");
          refreshBtn.setAttribute("aria-busy", "true");
          const dealingState = refreshBtn.querySelector(".pc-refresh-state");
          if (dealingState) dealingState.textContent = "DEALING";
          window.sendGameAction?.({
            type: "POWER_CHOICE_REFRESH",
            userId: me(),
            choiceId: current.id
          });
        });
      }
    }

    // Rarity is communicated visually by each card; numeric odds stay out of the play surface.
    const grid = modal.querySelector(".pc-card-grid");
    renderRewardChoiceCards(pending, grid);
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
    const first = grid.querySelector("button");
    requestAnimationFrame(() => {
      const card = modal.querySelector(".pc-modal-card");
      if (card) card.scrollTop = 0;
      try {
        first?.focus({ preventScroll: true });
      } catch (_) {
        first?.focus();
      }
    });
  }

  function showChoice() {
    const modal = ensureChoiceModal();
    const pending = window.state?.powerChoice?.pendingChoice;
    if (!isMode() || !pending || pending.ownerUserId !== me()) {
      modal.classList.remove("is-open", "is-peeking");
      byId("pcRewardPeekBar")?.classList.remove("is-visible");
      modal.dataset.choiceId = "";
      modal.dataset.choiceRevision = "";
      if (rewardModalTimer) {
        clearTimeout(rewardModalTimer);
        rewardModalTimer = null;
      }
      rewardModalPendingId = "";
      return;
    }
    // Same choice id can receive new cards after a refresh. Revision lets us
    // redraw immediately without re-running the reward settle delay/flourish.
    const pendingRevision = String(pending.revision || 0);
    if (modal.dataset.choiceId === pending.id && modal.classList.contains("is-open")) {
      if (modal.dataset.choiceRevision !== pendingRevision) {
        if (rewardModalTimer) {
          clearTimeout(rewardModalTimer);
          rewardModalTimer = null;
        }
        rewardModalPendingId = pending.id;
        openRewardModal(pending);
      }
      return;
    }
    // A settle-timer for this same id is already ticking -- don't restart
    // it and don't re-trigger the flourish every render tick. This used
    // to be `if (rewardModalPendingId === pending.id) return;` alone,
    // treating "I've started opening this once" as permanent -- so if the
    // modal ever ended up closed while the same reward was still pending
    // (a reconnect/resync landing between the settle-timer firing and the
    // player actually seeing it, for one) nothing would ever reopen it:
    // the id still matched, so every later render silently no-opped
    // forever, and the player was left staring at the board with a turn
    // the server was still blocking on a choice they had no way back to.
    // Requiring the timer to still be live narrows the guard to its
    // actual purpose -- don't double-schedule -- without also suppressing
    // a legitimate re-open once nothing is actually in flight.
    if (rewardModalTimer && rewardModalPendingId === pending.id) return;
    rewardModalPendingId = pending.id;
    if (pending.role === "guesser") showQuestMetFlourish();

    clearTimeout(rewardModalTimer);
    rewardModalTimer = setTimeout(() => {
      rewardModalTimer = null;
      if (window.state?.powerChoice?.pendingChoice?.id === pending.id) {
        openRewardModal(pending);
      }
    }, REWARD_MODAL_SETTLE_MS);
  }

  // POWER CHOICE RARITY + REFRESH V1: CLIENT END
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

    spyVisualOverride = before;
    renderPanels();

    if (!totalStars) {
      spyVisualOverride = after;
      renderPanels();
      return;
    }

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) {
      spyVisualOverride = after;
      renderPanels();
      spyAwardTarget()?.classList.add("pc-star-landed");
      setTimeout(() => spyAwardTarget()?.classList.remove("pc-star-landed"), 450);
      return;
    }

    const sourceRect = entry?.sourceRect;
    const sourceX = sourceRect?.width
      ? sourceRect.left + sourceRect.width / 2
      : Math.max(48, window.innerWidth * 0.52);
    const sourceY = sourceRect?.height
      ? sourceRect.top + sourceRect.height / 2
      : Math.max(90, window.innerHeight * 0.66);

    const sourcePulse = document.createElement("span");
    sourcePulse.className = "pc-spy-source-pulse";
    sourcePulse.textContent = "★";
    Object.assign(sourcePulse.style, { left: `${sourceX}px`, top: `${sourceY}px` });
    document.body.appendChild(sourcePulse);
    sourcePulse.animate([
      { transform: "translate(-50%,-50%) scale(.35)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1.25)", opacity: 1, offset: .45 },
      { transform: "translate(-50%,-50%) scale(1.8)", opacity: 0 }
    ], { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.finally(() => sourcePulse.remove());

    await sleep(80);

    // Resolve every star's landing target up front (instead of mid-loop)
    // so the shared bunch geometry below can be computed from real
    // distances before any star actually launches.
    const plans = [];
    for (let index = 0; index < totalStars; index++) {
      const value = Math.min(after, before + index + 1);
      const bonus = index >= appliedBase;
      const meter = spyAwardTarget();
      const target = meter?.id === "pcSpyMeter"
        ? meter.querySelector(`[data-pc-meter-value="${value}"]`) || meter
        : meter;
      const targetRect = target?.getBoundingClientRect();
      if (!targetRect?.width) {
        spyVisualOverride = value;
        renderPanels();
        continue;
      }
      plans.push({ index, value, bonus, isFinal: index === totalStars - 1, targetRect });
    }

    if (plans.length) {
      // Launched close together instead of one-at-a-time -- stagger is
      // short enough, and duration long enough, that landing order still
      // matches launch order (see the duration floor below).
      const LAUNCH_STAGGER = 75;

      // One random bend for the whole bunch, picked as if it were the
      // first star's own path -- every star in the award curves the same
      // rough way (plus a small per-star wobble below) so they read as a
      // flock following a leader instead of identical geometric clones.
      const bunchArcJitter = (Math.random() - 0.5) * 64;
      const bunchLateralJitter = (Math.random() - 0.5) * 44;

      const last = plans[plans.length - 1].targetRect;
      const refDx = last.left + last.width / 2 - sourceX;
      const refDy = last.top + last.height / 2 - sourceY;
      const duration = Math.min(
        640,
        Math.max(380, LAUNCH_STAGGER * plans.length + 160, Math.hypot(refDx, refDy) * .58)
      );

      const landings = plans.map(({ index, value, bonus, isFinal, targetRect }) => (async () => {
        if (index) await sleep(index * LAUNCH_STAGGER);

        const startX = sourceX + (index - (totalStars - 1) / 2) * 12;
        const startY = sourceY - (index % 2) * 8;
        const endX = targetRect.left + targetRect.width / 2;
        const endY = targetRect.top + targetRect.height / 2;
        const dx = endX - startX;
        const dy = endY - startY;
        const baseArc = Math.min(230, Math.max(112, Math.abs(dx) * .22 + Math.abs(dy) * .14));
        const arc = baseArc + bunchArcJitter;
        const lateral = bunchLateralJitter + (Math.random() - 0.5) * 16;

        const star = document.createElement("span");
        star.className = `pc-direct-star-flight${bonus ? " is-bonus" : ""}${isFinal ? " is-final" : ""}`;
        star.textContent = "★";
        Object.assign(star.style, { left: `${startX}px`, top: `${startY}px` });
        document.body.appendChild(star);

        // A gentle wind-up (barely any movement through ~18% of the
        // flight) before the star actually launches into its arc, then a
        // wide swoop up and over on the way to the target -- reads as a
        // beat of anticipation rather than an instant snap into motion.
        const flight = star.animate([
          { transform: "translate(-50%,-50%) scale(.5) rotate(-22deg)", opacity: 0 },
          {
            transform: `translate(calc(-50% + ${dx * .1 + lateral * .25}px), calc(-50% + ${dy * .1 - arc * .3}px)) scale(.82) rotate(-8deg)`,
            opacity: 1,
            offset: .18
          },
          {
            transform: `translate(calc(-50% + ${dx * .5 + lateral}px), calc(-50% + ${dy * .42 - arc}px)) scale(1.32) rotate(12deg)`,
            opacity: 1,
            offset: .56
          },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.35) rotate(0deg)`,
            opacity: 1
          }
        ], {
          duration,
          easing: "cubic-bezier(.32,.04,.2,1)",
          fill: "forwards"
        });
        try { await flight.finished; } catch {}
        star.remove();

        spyVisualOverride = value;
        renderPanels();
        await new Promise(resolve => requestAnimationFrame(resolve));

        const freshMeter = spyAwardTarget();
        const landed = freshMeter?.id === "pcSpyMeter"
          ? freshMeter.querySelector(`[data-pc-meter-value="${value}"]`) || freshMeter
          : freshMeter;
        const landedRect = landed?.getBoundingClientRect() || targetRect;
        landed?.classList.add("pc-star-landed", ...(isFinal ? ["is-final"] : []));
        setTimeout(() => landed?.classList.remove("pc-star-landed", "is-final"), isFinal ? 680 : 480);

        const impact = document.createElement("span");
        impact.className = `pc-star-impact${bonus ? " is-bonus" : ""}${isFinal ? " is-final" : ""}`;
        Object.assign(impact.style, {
          left: `${landedRect.left + landedRect.width / 2}px`,
          top: `${landedRect.top + landedRect.height / 2}px`
        });
        document.body.appendChild(impact);
        impact.addEventListener("animationend", () => impact.remove(), { once: true });

        const sparkCount = isFinal ? 10 : 5;
        for (let sparkIndex = 0; sparkIndex < sparkCount; sparkIndex++) {
          const spark = document.createElement("span");
          spark.className = `pc-star-spark${bonus ? " is-bonus" : ""}${isFinal ? " is-final" : ""}`;
          const angle = (Math.PI * 2 * sparkIndex) / sparkCount - Math.PI / 2;
          const distance = (isFinal ? 30 : 18) + (sparkIndex % 2) * (isFinal ? 14 : 8);
          Object.assign(spark.style, {
            left: `${landedRect.left + landedRect.width / 2}px`,
            top: `${landedRect.top + landedRect.height / 2}px`,
            "--pc-spark-x": `${Math.cos(angle) * distance}px`,
            "--pc-spark-y": `${Math.sin(angle) * distance}px`
          });
          document.body.appendChild(spark);
          spark.addEventListener("animationend", () => spark.remove(), { once: true });
        }

        // The final star also shoots a burst of tiny stars outward --
        // its own distinct payoff, separate from every star's round sparks.
        if (isFinal) {
          const miniCount = 8;
          for (let miniIndex = 0; miniIndex < miniCount; miniIndex++) {
            const mini = document.createElement("span");
            mini.className = `pc-star-mini${bonus ? " is-bonus" : ""}`;
            mini.textContent = "★";
            const angle = (Math.PI * 2 * miniIndex) / miniCount - Math.PI / 2 + (Math.random() - .5) * .35;
            const distance = 44 + Math.random() * 30;
            Object.assign(mini.style, {
              left: `${landedRect.left + landedRect.width / 2}px`,
              top: `${landedRect.top + landedRect.height / 2}px`,
              "--pc-mini-x": `${Math.cos(angle) * distance}px`,
              "--pc-mini-y": `${Math.sin(angle) * distance}px`,
              "--pc-mini-rot": `${(Math.random() - .5) * 420}deg`
            });
            document.body.appendChild(mini);
            mini.addEventListener("animationend", () => mini.remove(), { once: true });
          }
        }
      })());

      await Promise.all(landings);
    }

    spyVisualOverride = after;
    renderPanels();
    const finalTarget = spyAwardTarget();
    finalTarget?.classList.add("just-charged");
    setTimeout(() => finalTarget?.classList.remove("just-charged"), 720);
    await sleep(120);
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
