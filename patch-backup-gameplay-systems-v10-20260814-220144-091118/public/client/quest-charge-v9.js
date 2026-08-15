(() => {
  "use strict";

  const DEFAULT_RARE = "QJXZWKV".split("");
  const VOWELS = new Set(["A", "E", "I", "O", "U"]);
  const KEYBOARD_ROWS = [
    { name: "top", label: "TOP", letters: "QWERTYUIOP".split("") },
    { name: "home", label: "HOME", letters: "ASDFGHJKL".split("") },
    { name: "bottom", label: "BOTTOM", letters: "ZXCVBNM".split("") }
  ];

  const LIMITS = {
    RARE: 6,
    ALPHA: 3,
    DOUBLES: 3,
    CHAIN: 2,
    HARDMODE: 4,
    FIELDREPORT: 8,
    ALTERNATING: 3,
    BOOKENDS: 3,
    HALF_AM: 3,
    HALF_NZ: 3,
    VOWELSHORTAGE: 4
  };

  const FIELD_YELLOW = 6;
  const byId = id => document.getElementById(id);

  let visualProgress = null;
  let currentQuestKey = "";
  let animationRunning = false;
  let queuedProgress = null;
  let lastDraftWord = "";
  let lastQualifyingSource = null;
  let lastQualifyingAt = 0;
  let draftObserver = null;
  let originalUpdateQuestBadge = null;

  function cleanWord(value) {
    return String(value || "").replace(/\s/g, "").toUpperCase();
  }

  function questKey(state) {
    const q = state?.powers?.quest;
    return [
      state?.matchId || "",
      state?.roundIndex ?? "",
      state?.guesser || "",
      q?.type || ""
    ].join("|");
  }

  function rareLetters(q) {
    return Array.isArray(q?.rareLetters) && q.rareLetters.length
      ? q.rareLetters.map(cleanWord)
      : DEFAULT_RARE;
  }

  function baseHistory(state) {
    return Array.isArray(state?.history)
      ? state.history.filter(entry => entry?.guess)
      : [];
  }

  function committedHistory(state) {
    const history = baseHistory(state).map(entry => ({ ...entry }));
    const pending = cleanWord(state?.pendingGuess);
    const last = cleanWord(history.at(-1)?.guess);

    if (pending.length === 5 && pending !== last) {
      history.push({ guess: pending, __pendingQuestGuess: true });
    }

    return history;
  }

  function currentDraftWord() {
    const row = byId("draftGuesser")?.__draftRows?.draft ||
      document.querySelector("#draftGuesser .history-row.guesser-draft");

    if (!row || row.style.display === "none") return "";

    return [...row.querySelectorAll(":scope > .history-tile")]
      .map(tile => tile.textContent?.trim() || "")
      .join("")
      .toUpperCase();
  }

  function countVowels(word) {
    return [...word].filter(letter => VOWELS.has(letter)).length;
  }

  function isAlternating(word) {
    if (word.length !== 5) return false;
    for (let index = 1; index < word.length; index++) {
      if (VOWELS.has(word[index]) === VOWELS.has(word[index - 1])) return false;
    }
    return true;
  }

  function isAlpha(word) {
    if (word.length !== 5) return false;
    let up = true;
    let down = true;
    for (let index = 1; index < word.length; index++) {
      if (word.charCodeAt(index) <= word.charCodeAt(index - 1)) up = false;
      if (word.charCodeAt(index) >= word.charCodeAt(index - 1)) down = false;
    }
    return up || down;
  }

  function doubledLetter(word) {
    for (let index = 0; index < word.length - 1; index++) {
      if (word[index] === word[index + 1]) return word[index];
    }
    return null;
  }

  function inRange(word, low, high) {
    return word.length === 5 && [...word].every(letter => letter >= low && letter <= high);
  }

  function satisfiesCondition(word, condition) {
    if (!condition || word.length !== 5) return false;
    const letter = cleanWord(condition.letter);

    switch (condition.type) {
      case "startsWith": return word.startsWith(letter);
      case "endsWith": return word.endsWith(letter);
      case "doubleLetter": return word.includes(letter.repeat(2));
      case "minVowels": return countVowels(word) >= Number(condition.count || 0);
      case "maxVowels": return countVowels(word) <= Number(condition.count || 0);
      case "firstLastSame": return word[0] === word[4];
      case "palindrome": return word === [...word].reverse().join("");
      default: return false;
    }
  }

  function formatCondition(condition) {
    if (typeof window.formatFieldReportCondition === "function") {
      return window.formatFieldReportCondition(condition);
    }

    const letter = cleanWord(condition?.letter);
    switch (condition?.type) {
      case "startsWith": return `Starts with ${letter}`;
      case "endsWith": return `Ends with ${letter}`;
      case "doubleLetter": return `Has ${letter}${letter}`;
      case "minVowels": return `${condition.count}+ vowels`;
      case "maxVowels": return `At most ${condition.count} vowels`;
      case "firstLastSame": return "Same first and last letter";
      case "palindrome": return "Reads the same backward";
      default: return "Special condition";
    }
  }

  function hardModeConstraints(history) {
    const greens = [null, null, null, null, null];
    const yellows = new Map();

    for (const entry of history) {
      const word = cleanWord(entry.guess);
      const feedback = entry.fbGuesser || entry.fb;
      if (word.length !== 5 || !Array.isArray(feedback)) continue;

      for (let index = 0; index < 5; index++) {
        if (feedback[index] === "🟩") greens[index] = word[index];
        if (feedback[index] === "🟨") {
          if (!yellows.has(word[index])) yellows.set(word[index], new Set());
          yellows.get(word[index]).add(index);
        }
      }
    }

    return { greens, yellows };
  }

  function hardModeCompliant(history, word) {
    if (word.length !== 5) return false;
    const { greens, yellows } = hardModeConstraints(history);

    for (let index = 0; index < 5; index++) {
      if (greens[index] && word[index] !== greens[index]) return false;
    }

    for (const [letter, bannedPositions] of yellows) {
      if (!word.includes(letter)) return false;
      for (const position of bannedPositions) {
        if (word[position] === letter) return false;
      }
    }

    return true;
  }

  function hardModeProgress(history) {
    const prior = [];
    let count = 0;

    for (const entry of history) {
      const word = cleanWord(entry.guess);
      if (word.length !== 5) continue;
      if (hardModeCompliant(prior, word)) count++;
      prior.push(entry);
    }

    return count;
  }

  function fieldProgress(history, q) {
    let total = 0;
    const conditionHistory = Array.isArray(q?.conditionsHistory)
      ? q.conditionsHistory
      : [];

    history.forEach((entry, index) => {
      const word = cleanWord(entry.guess);
      if (word.length !== 5) return;

      const conditions = entry.__pendingQuestGuess
        ? q?.conditions
        : conditionHistory[index];

      if (!Array.isArray(conditions)) return;
      total += conditions.filter(condition => satisfiesCondition(word, condition)).length;
    });

    return total;
  }

  function progressSnapshot(state, history = committedHistory(state)) {
    const q = state?.powers?.quest;
    const type = q?.type;
    if (!type) return null;

    if (q.used) {
      const max = type === "ROW" ? 1 : LIMITS[type] || 1;
      return { type, progress: max, max, yellowAt: max, done: true };
    }

    if (type === "RARE") {
      const targets = rareLetters(q);
      const used = new Set();
      for (const entry of history) {
        const word = cleanWord(entry.guess);
        targets.forEach(letter => { if (word.includes(letter)) used.add(letter); });
      }
      return {
        type,
        progress: Math.min(used.size, LIMITS.RARE),
        max: LIMITS.RARE,
        yellowAt: LIMITS.RARE - 1,
        used,
        targets
      };
    }

    if (type === "ROW") {
      const coverages = KEYBOARD_ROWS.map(row => ({
        ...row,
        used: new Set()
      }));

      for (const entry of history) {
        for (const letter of cleanWord(entry.guess)) {
          coverages.forEach(row => {
            if (row.letters.includes(letter)) row.used.add(letter);
          });
        }
      }

      coverages.sort((a, b) =>
        (b.used.size / b.letters.length) - (a.used.size / a.letters.length)
      );
      const best = coverages[0];
      return {
        type,
        progress: best.used.size,
        max: best.letters.length,
        yellowAt: best.letters.length - 1,
        row: best,
        rows: coverages
      };
    }

    if (type === "ALPHA") {
      const progress = history.filter(entry => isAlpha(cleanWord(entry.guess))).length;
      return { type, progress, max: LIMITS.ALPHA, yellowAt: LIMITS.ALPHA - 1 };
    }

    if (type === "DOUBLES") {
      const used = new Set();
      history.forEach(entry => {
        const doubled = doubledLetter(cleanWord(entry.guess));
        if (doubled) used.add(doubled);
      });
      return {
        type,
        progress: used.size,
        max: LIMITS.DOUBLES,
        yellowAt: LIMITS.DOUBLES - 1,
        usedDoubles: used
      };
    }

    if (type === "CHAIN") {
      let links = 0;
      for (let index = 1; index < history.length; index++) {
        const prior = cleanWord(history[index - 1].guess);
        const word = cleanWord(history[index].guess);
        if (prior.length === 5 && word[0] === prior[4]) links++;
      }
      return {
        type,
        progress: links,
        max: LIMITS.CHAIN,
        yellowAt: LIMITS.CHAIN - 1,
        nextLetter: cleanWord(history.at(-1)?.guess).at(-1) || ""
      };
    }

    if (type === "HARDMODE") {
      const progress = hardModeProgress(history);
      return { type, progress, max: LIMITS.HARDMODE, yellowAt: LIMITS.HARDMODE - 1 };
    }

    if (type === "FIELDREPORT") {
      const progress = fieldProgress(history, q);
      return {
        type,
        progress,
        max: LIMITS.FIELDREPORT,
        yellowAt: FIELD_YELLOW,
        conditions: Array.isArray(q.conditions) ? q.conditions : []
      };
    }

    const predicates = {
      ALTERNATING: word => isAlternating(word),
      BOOKENDS: word => word.length === 5 && word[0] === word[4],
      HALF_AM: word => inRange(word, "A", "P"),
      HALF_NZ: word => inRange(word, "K", "Z"),
      VOWELSHORTAGE: word => word.length === 5 && countVowels(word) === 1
    };

    const predicate = predicates[type];
    if (predicate) {
      const progress = history.filter(entry => predicate(cleanWord(entry.guess))).length;
      const max = LIMITS[type];
      return { type, progress, max, yellowAt: max - 1 };
    }

    return null;
  }

  function previewForDraft(state, word) {
    const base = progressSnapshot(state, baseHistory(state));
    if (!base || word.length !== 5) {
      return { base, preview: base, delta: 0, qualifies: false };
    }

    const previewHistory = [...baseHistory(state), { guess: word, __pendingQuestGuess: true }];
    const preview = progressSnapshot(state, previewHistory);
    const delta = Math.max(0, (preview?.progress || 0) - (base.progress || 0));

    return { base, preview, delta, qualifies: delta > 0 };
  }

  function ensureHud() {
    window.ensureGuesserBoardV9?.();
    const sidebar = byId("guesserSidebar") || document.querySelector("#guesserScreen .powers-col");
    const container = byId("guesserPowerContainer");
    if (!sidebar || !container) return null;

    let hud = byId("guesserQuestChargeHud");
    if (!hud) {
      hud = document.createElement("section");
      hud.id = "guesserQuestChargeHud";
      hud.className = "guesser-quest-charge-hud hidden";
      hud.innerHTML = `
        <div class="guesser-quest-charge-head">
          <span id="guesserQuestChargeName">Quest</span>
          <span id="guesserQuestChargeCount">0/0</span>
        </div>
        <div id="guesserQuestChargeMeter" class="guesser-quest-charge-meter" role="meter" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"></div>
      `;
      container.parentElement?.insertBefore(hud, container);
    }

    return hud;
  }

  function ensureRequirement() {
    const draftStack = document.querySelector("#guesserScreen .draft-stack");
    const draftContainer = byId("draftGuesser");
    if (!draftStack || !draftContainer) return null;

    let requirement = byId("guesserQuestRequirement");
    if (!requirement) {
      requirement = document.createElement("div");
      requirement.id = "guesserQuestRequirement";
      requirement.className = "guesser-quest-requirement hidden";
      draftStack.insertBefore(requirement, draftContainer);
    }

    return requirement;
  }

  function renderMeter(snapshot, q) {
    const hud = ensureHud();
    if (!hud || !snapshot) return;

    hud.classList.remove("hidden");
    const meter = byId("guesserQuestChargeMeter");
    const name = byId("guesserQuestChargeName");
    const count = byId("guesserQuestChargeCount");
    if (!meter || !name || !count) return;

    const max = Math.max(1, snapshot.max || 1);
    meter.style.setProperty("--quest-segments", String(max));
    const shown = Math.max(0, Math.min(max, visualProgress ?? snapshot.progress ?? 0));
    const yellow = !!q?.oneAway || shown >= snapshot.yellowAt;
    const green = !!q?.ready || !!q?.used || shown >= max;

    name.textContent = window.QUEST_METADATA?.[snapshot.type]?.label || "Quest";
    count.textContent = `${shown}/${max}`;

    if (Number(meter.dataset.max) !== max) {
      meter.dataset.max = String(max);
      meter.replaceChildren(...Array.from({ length: max }, (_, index) => {
        const segment = document.createElement("span");
        segment.className = "guesser-quest-charge-segment";
        segment.dataset.questChargeIndex = String(index);
        return segment;
      }));
    }

    meter.querySelectorAll(".guesser-quest-charge-segment").forEach((segment, index) => {
      segment.classList.toggle("is-filled", index < shown);
      segment.classList.toggle("is-yellow", yellow && index < shown);
      segment.classList.toggle("is-green", green && index < shown);
      segment.classList.toggle("is-next", index === shown && shown < max);
    });

    meter.classList.toggle("is-yellow", yellow && !green);
    meter.classList.toggle("is-green", green);
    meter.setAttribute("aria-valuemax", String(max));
    meter.setAttribute("aria-valuenow", String(shown));
    meter.setAttribute("aria-label", `Quest progress: ${shown} of ${max}`);

    const mini = byId("guesserSidebarChargeMini");
    if (mini) {
      mini.textContent = String(shown);
      mini.classList.toggle("hidden", !window.isGuesserSidebarCollapsed?.());
      mini.classList.toggle("is-yellow", yellow && !green);
      mini.classList.toggle("is-green", green);
    }
  }

  function requirementHtml(state, snapshot, draftPreview) {
    const q = state?.powers?.quest;
    const type = q?.type;
    const word = currentDraftWord();
    const delta = draftPreview?.delta || 0;
    const progress = snapshot?.progress || 0;
    const max = snapshot?.max || 0;
    const title = window.QUEST_METADATA?.[type]?.label || "Quest";
    const progressText = `<span class="quest-requirement-progress">${progress}/${max}</span>`;

    if (type === "RARE") {
      const used = snapshot.used || new Set();
      const draftLetters = new Set([...word]);
      const letters = snapshot.targets.map(letter => {
        const stateClass = used.has(letter)
          ? "is-used"
          : draftLetters.has(letter)
            ? "is-in-draft"
            : "";
        return `<span class="quest-requirement-letter ${stateClass}">${letter}</span>`;
      }).join("");

      return `
        <div class="quest-requirement-top"><strong>${title}</strong>${progressText}</div>
        <div class="quest-requirement-copy">Use ${max} different rare letters</div>
        <div class="quest-requirement-letters">${letters}</div>
        ${delta ? `<div class="quest-requirement-gain">This word adds +${delta}</div>` : ""}
      `;
    }

    if (type === "FIELDREPORT") {
      const conditions = snapshot.conditions || [];
      const rows = conditions.map(condition => {
        const hit = word.length === 5 && satisfiesCondition(word, condition);
        return `<span class="quest-condition-chip${hit ? " is-hit" : ""}">${hit ? "✓" : "○"} ${formatCondition(condition)}</span>`;
      }).join("");

      return `
        <div class="quest-requirement-top"><strong>${title}</strong>${progressText}</div>
        <div class="quest-condition-list">${rows}</div>
        <div class="quest-requirement-gain${delta ? " is-live" : ""}">${word.length === 5 ? `This word adds +${delta}` : "Each matched rule adds 1"}</div>
      `;
    }

    if (type === "CHAIN") {
      const needed = snapshot.nextLetter;
      const copy = needed
        ? `Start the next word with <b class="quest-chain-letter">${needed}</b>`
        : "Any word starts the chain";
      return `<div class="quest-requirement-top"><strong>${title}</strong>${progressText}</div><div class="quest-requirement-copy">${copy}</div>`;
    }

    const copies = {
      ROW: `Complete the ${snapshot.row?.label || "closest"} keyboard row`,
      ALPHA: "Put all 5 letters in A→Z or Z→A order",
      DOUBLES: "Use a new double letter, like EE or LL",
      HARDMODE: "Use every green and yellow clue you already know",
      ALTERNATING: "Alternate consonant and vowel",
      BOOKENDS: "Use the same first and last letter",
      HALF_AM: "Use only letters A through P",
      HALF_NZ: "Use only letters K through Z",
      VOWELSHORTAGE: "Use exactly 1 vowel"
    };

    return `
      <div class="quest-requirement-top"><strong>${title}</strong>${progressText}</div>
      <div class="quest-requirement-copy">${copies[type] || "Complete the Quest"}</div>
      ${delta ? `<div class="quest-requirement-gain">This word adds +${delta}</div>` : ""}
    `;
  }

  function renderRequirement(state, snapshot) {
    const requirement = ensureRequirement();
    if (!requirement) return;

    const q = state?.powers?.quest;
    const show = window.myRole === "guesser" && !!q?.type && !q.used;
    requirement.classList.toggle("hidden", !show);
    if (!show) return;

    const word = currentDraftWord();
    const draftPreview = previewForDraft(state, word);
    requirement.innerHTML = requirementHtml(state, snapshot, draftPreview);
    requirement.classList.toggle("is-qualified", draftPreview.qualifies);
    requirement.dataset.questType = q.type;
    requirement.style.setProperty("--quest-draft-gain", String(draftPreview.delta));

    const draftRow = byId("draftGuesser")?.__draftRows?.draft ||
      document.querySelector("#draftGuesser .history-row.guesser-draft");

    draftRow?.classList.toggle(
      "quest-draft-electric",
      word.length === 5 && draftPreview.qualifies
    );

    // Keep the last qualifying source while submission clears the draft;
    // the following state update needs that rect for the lightning flight.
    // A different complete non-qualifying word, however, invalidates it.
    if (word.length === 5 && !draftPreview.qualifies) {
      lastQualifyingSource = null;
      lastQualifyingAt = 0;
    }

    if (word.length === 5 && draftPreview.qualifies && draftRow) {
      const rect = draftRow.getBoundingClientRect();
      if (rect.width && rect.height) {
        lastDraftWord = word;
        lastQualifyingSource = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
        lastQualifyingAt = Date.now();
      }
    }
  }

  function updateQuestCard(state, snapshot) {
    const q = state?.powers?.quest;
    const card = document.querySelector("#guesserPowerContainer .quest-badge-tile");
    if (!card || !snapshot) return;

    const progress = Math.max(0, Math.min(snapshot.max, visualProgress ?? snapshot.progress));
    const chip = card.querySelector(".quest-progress-chip");
    if (chip) chip.textContent = q.used ? "Done" : q.ready ? "Ready" : `${progress}/${snapshot.max}`;

    const yellow = !!q.oneAway || progress >= snapshot.yellowAt;
    const green = !!q.ready || !!q.used || progress >= snapshot.max;
    card.classList.toggle("quest-oneaway", yellow && !green);
    card.classList.toggle("quest-ready", green && !q.used);
    card.classList.toggle("quest-done", !!q.used);
  }

  function createBolt(sourceRect, targetRect, delay) {
    return new Promise(resolve => {
      const bolt = document.createElement("div");
      bolt.className = "quest-charge-flight-bolt";
      bolt.textContent = "⚡";

      const startX = sourceRect.left + sourceRect.width / 2;
      const startY = sourceRect.top + sourceRect.height / 2;
      const endX = targetRect.left + targetRect.width / 2;
      const endY = targetRect.top + targetRect.height / 2;
      const dx = endX - startX;
      const dy = endY - startY;

      bolt.style.left = `${startX}px`;
      bolt.style.top = `${startY}px`;
      document.body.appendChild(bolt);

      setTimeout(() => {
        const animation = bolt.animate(
          [
            { opacity: 0, transform: "translate(-50%, -50%) scale(.45) rotate(-25deg)" },
            { opacity: 1, offset: .16, transform: "translate(-50%, -65%) scale(1.35) rotate(18deg)" },
            { opacity: 1, offset: .65, transform: `translate(calc(-50% + ${dx * .72}px), calc(-50% + ${dy * .72 - 16}px)) scale(1.05) rotate(330deg)` },
            { opacity: 0, transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.35) rotate(520deg)` }
          ],
          { duration: 650, easing: "cubic-bezier(.18,.8,.2,1)", fill: "forwards" }
        );

        animation.finished.catch(() => {}).then(() => {
          bolt.remove();
          resolve();
        });
      }, delay);
    });
  }

  async function animateProgressTo(state, snapshot, targetProgress) {
    if (animationRunning) {
      queuedProgress = Math.max(queuedProgress ?? 0, targetProgress);
      return;
    }

    animationRunning = true;
    const start = visualProgress ?? snapshot.progress;
    const delta = Math.max(0, targetProgress - start);
    const source = lastQualifyingSource;
    const recent = source && Date.now() - lastQualifyingAt < 7000;

    if (!delta || !recent || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      visualProgress = targetProgress;
      renderMeter(snapshot, state.powers?.quest);
      animationRunning = false;
      return;
    }

    const drawerClosed = !!window.isGuesserSidebarCollapsed?.();
    const toast = drawerClosed
      ? window.showCollapsedChargeToast?.("guesser", {
          value: targetProgress,
          max: snapshot.max,
          delta,
          tone: targetProgress >= snapshot.max ? "green" : targetProgress >= snapshot.yellowAt ? "yellow" : "blue"
        })
      : null;

    for (let index = 0; index < delta; index++) {
      const nextValue = Math.min(snapshot.max, start + index + 1);
      const target = drawerClosed
        ? toast || byId("guesserSidebarToggle")
        : document.querySelector(`[data-quest-charge-index="${nextValue - 1}"]`);

      if (target) {
        await createBolt(source, target.getBoundingClientRect(), index === 0 ? 0 : 40);
      }

      visualProgress = nextValue;
      renderMeter(snapshot, state.powers?.quest);
      const segment = document.querySelector(`[data-quest-charge-index="${nextValue - 1}"]`);
      segment?.classList.add("just-charged");
      setTimeout(() => segment?.classList.remove("just-charged"), 480);
    }

    animationRunning = false;
    lastQualifyingSource = null;

    if (queuedProgress != null && queuedProgress > visualProgress) {
      const queued = queuedProgress;
      queuedProgress = null;
      animateProgressTo(state, snapshot, queued);
    }
  }

  function update(state = window.state, role = window.myRole) {
    if (!state) return;
    window.ensureGuesserBoardV9?.();

    const q = state.powers?.quest;
    const snapshot = progressSnapshot(state);
    const hud = ensureHud();

    if (!q?.type || role !== "guesser" || !snapshot) {
      hud?.classList.add("hidden");
      byId("guesserQuestRequirement")?.classList.add("hidden");
      return;
    }

    const key = questKey(state);
    if (key !== currentQuestKey) {
      currentQuestKey = key;
      visualProgress = snapshot.progress;
      queuedProgress = null;
      animationRunning = false;
      lastQualifyingSource = null;
    }

    renderMeter(snapshot, q);
    renderRequirement(state, snapshot);
    updateQuestCard(state, snapshot);

    if (snapshot.progress > (visualProgress ?? 0)) {
      animateProgressTo(state, snapshot, snapshot.progress);
    } else if (!animationRunning && snapshot.progress < (visualProgress ?? 0)) {
      visualProgress = snapshot.progress;
      renderMeter(snapshot, q);
    }
  }

  function installQuestWrapper() {
    if (window.updateQuestBadge?.__questChargeV9) return;
    originalUpdateQuestBadge = window.updateQuestBadge;

    const wrapped = function (state, role) {
      originalUpdateQuestBadge?.(state, role);
      update(state, role);
    };
    wrapped.__questChargeV9 = true;
    window.updateQuestBadge = wrapped;
  }

  function observeDraft() {
    const container = byId("draftGuesser");
    if (!container || draftObserver) return;

    draftObserver = new MutationObserver(() => {
      const word = currentDraftWord();
      if (word !== lastDraftWord || word.length !== 5) {
        lastDraftWord = word;
      }
      update(window.state, window.myRole);
    });

    draftObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
  }

  function init() {
    installQuestWrapper();
    observeDraft();
    update(window.state, window.myRole);
  }

  window.getQuestChargeV9 = state => progressSnapshot(state || window.state);
  window.updateQuestChargeV9 = update;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
