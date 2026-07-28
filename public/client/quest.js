// client/quest.js — Guesser Quests
//
// All quest UI lives in the shared info-badge strip (see
// InfoBadgeEngine.js) -- there used to also be a standalone quest box
// above the guesser's power buttons, but it was folded into the badge so
// there's one place to look, on both screens. computeQuestStatus mirrors
// the server's unlock thresholds so the progress readout updates
// instantly from public history data, same pattern as
// powerEngine/powers/revealLetter.js's computeRevealLetterStatus (kept in
// sync manually -- the server in questServer.js is the source of truth
// for when a quest actually unlocks).
//
// "Openly known to both players": the InfoBadgeEngine registration below
// surfaces the quest's type and live progress on BOTH screens via the
// shared info-badge strip, so the setter isn't left guessing what the
// guesser is working toward. Only the guesser's badge is ever clickable
// (see the `role === "guesser"` check below) -- the setter's copy is
// read-only.
const QUEST_RARE_LETTERS = "QJXZWKV".split("");
const QUEST_KEYBOARD_ROWS = [
  { name: "Top row (QWERTYUIOP)", letters: "QWERTYUIOP".split("") },
  { name: "Home row (ASDFGHJKL)", letters: "ASDFGHJKL".split("") },
  { name: "Bottom row (ZXCVBNM)", letters: "ZXCVBNM".split("") }
];

function questIsAscendingWord(word) {
  for (let i = 1; i < word.length; i++) {
    if (word.charCodeAt(i) <= word.charCodeAt(i - 1)) return false;
  }
  return true;
}

function questDoubledLetterOf(word) {
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === word[i + 1]) return word[i];
  }
  return null;
}

const QUEST_VOWELS = new Set(["A", "E", "I", "O", "U"]);
function questCountVowels(word) {
  let n = 0;
  for (const c of word) if (QUEST_VOWELS.has(c)) n++;
  return n;
}

function questIsAlternatingWord(word) {
  for (let i = 1; i < word.length; i++) {
    if (QUEST_VOWELS.has(word[i]) === QUEST_VOWELS.has(word[i - 1])) return false;
  }
  return true;
}

function questIsReverseAlphaWord(word) {
  for (let i = 1; i < word.length; i++) {
    if (word.charCodeAt(i) >= word.charCodeAt(i - 1)) return false;
  }
  return true;
}

function questIsInLetterRange(word, minLetter, maxLetter) {
  const min = minLetter.charCodeAt(0);
  const max = maxLetter.charCodeAt(0);
  for (const c of word) {
    const code = c.charCodeAt(0);
    if (code < min || code > max) return false;
  }
  return true;
}

// Mirrors questServer.js's computeVowelShortageCount exactly.
function computeVowelShortageCount(history) {
  let count = 0;
  for (const entry of history) {
    if (!entry?.guess) continue;
    if (questCountVowels(entry.guess.toUpperCase()) === 1) count++;
  }
  return count;
}

// Mirrors questServer.js's computeHardModeCount exactly. mustInclude is a
// Map<letter, Set<excludedPositions>> -- a yellow letter must appear
// somewhere in the guess AND must not land back at a position it already
// came back yellow at (yellow means "in the word, not here").
function computeHardModeProgress(history) {
  const green = [null, null, null, null, null];
  const mustInclude = new Map();
  let count = 0;

  for (const entry of history) {
    const fb = entry.fbGuesser || entry.fb;
    if (!Array.isArray(fb) || !entry.guess) continue;
    const g = entry.guess.toUpperCase();

    let compliant = true;
    for (let i = 0; i < 5; i++) {
      if (green[i] && g[i] !== green[i]) compliant = false;
    }
    for (const [letter, excludedPositions] of mustInclude) {
      if (!g.includes(letter)) compliant = false;
      for (const pos of excludedPositions) {
        if (g[pos] === letter) compliant = false;
      }
    }
    if (compliant) count++;

    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟩") green[i] = g[i];
      else if (fb[i] === "🟨") {
        if (!mustInclude.has(g[i])) mustInclude.set(g[i], new Set());
        mustInclude.get(g[i]).add(i);
      }
    }
  }

  return count;
}

// Mirrors questServer.js's computeFieldReportCount exactly -- sums every
// condition each guess satisfies across the whole round, not "guesses
// meeting at least 2 of 3".
function computeFieldReportProgress(history, conditions) {
  if (!Array.isArray(conditions) || !conditions.length) return 0;
  let total = 0;
  for (const entry of history) {
    if (!entry?.guess || typeof satisfiesForceGuessClient !== "function") continue;
    total += conditions.filter(c => satisfiesForceGuessClient(entry.guess.toUpperCase(), c)).length;
  }
  return total;
}

// Small client-side mirror of server/game-engine/validation.js's
// satisfiesForceGuess -- no server module to import from in the browser.
function satisfiesForceGuessClient(g, c) {
  const VOWELS = new Set(["A", "E", "I", "O", "U"]);
  const countVowels = w => [...w].filter(ch => VOWELS.has(ch)).length;
  switch (c.type) {
    case "startsWith": return g.startsWith(c.letter.toUpperCase());
    case "endsWith": return g.endsWith(c.letter.toUpperCase());
    case "doubleLetter": return g.includes(c.letter.toUpperCase().repeat(2));
    case "minVowels": return countVowels(g) >= c.count;
    case "maxVowels": return countVowels(g) <= c.count;
    case "firstLastSame": return g[0] === g[g.length - 1];
    case "palindrome": return g === g.split("").reverse().join("");
    default: return false;
  }
}

function computeQuestStatus(state) {
  const q = state.powers?.quest;
  if (!q || !q.type) return null;

  const meta = window.QUEST_METADATA?.[q.type];
  if (!meta) return null;

  if (q.used) {
    const resultLetter = q.resultLetter ? q.resultLetter.toUpperCase() : null;
    if (q.claimedEarly) {
      return {
        meta,
        label: resultLetter ? `🟨 ${resultLetter}` : "Claimed early",
        desc: resultLetter
          ? `Claimed early: ${resultLetter} is somewhere in the secret (yellow).`
          : "Claimed early — nothing new was left to reveal.",
        done: true,
        claimedEarly: true,
        resultLetter,
        resultColor: "yellow"
      };
    }
    return {
      meta,
      label: resultLetter ? `🟩 ${resultLetter}` : "Complete!",
      desc: resultLetter
        ? `Complete! ${resultLetter} is green in position ${(q.resultIndex ?? 0) + 1}.`
        : "Free green letter revealed.",
      done: true,
      resultLetter,
      resultColor: "green",
      resultIndex: q.resultIndex
    };
  }
  if (q.ready) {
    return { meta, label: "Ready!", desc: "Revealing your green letter…", done: false };
  }

  const history = state.history || [];

  if (q.type === "RARE") {
    const seen = new Set();
    for (const h of history) {
      for (const c of (h.guess || "").toUpperCase()) {
        if (QUEST_RARE_LETTERS.includes(c)) seen.add(c);
      }
    }
    return { meta, label: `${seen.size}/5`, desc: meta.desc, done: false };
  }

  if (q.type === "ROW") {
    const used = QUEST_KEYBOARD_ROWS.map(() => new Set());
    for (const h of history) {
      for (const c of (h.guess || "").toUpperCase()) {
        QUEST_KEYBOARD_ROWS.forEach((row, i) => { if (row.letters.includes(c)) used[i].add(c); });
      }
    }
    let bestIdx = 0;
    QUEST_KEYBOARD_ROWS.forEach((row, i) => {
      if (used[i].size / row.letters.length > used[bestIdx].size / QUEST_KEYBOARD_ROWS[bestIdx].letters.length) {
        bestIdx = i;
      }
    });
    const row = QUEST_KEYBOARD_ROWS[bestIdx];
    return { meta, label: `${used[bestIdx].size}/${row.letters.length}`, desc: `${meta.desc} Closest: ${row.name}.`, done: false };
  }

  if (q.type === "ALPHA") {
    const count = history.filter(h => questIsAscendingWord((h.guess || "").toUpperCase())).length;
    return { meta, label: `${count}/3`, desc: meta.desc, done: false };
  }

  if (q.type === "DOUBLES") {
    const doubles = new Set();
    for (const h of history) {
      const d = questDoubledLetterOf((h.guess || "").toUpperCase());
      if (d) doubles.add(d);
    }
    return { meta, label: `${doubles.size}/3`, desc: meta.desc, done: false };
  }

  if (q.type === "CHAIN") {
    let links = 0;
    for (let i = 1; i < history.length; i++) {
      const prev = (history[i - 1].guess || "").toUpperCase();
      const curr = (history[i].guess || "").toUpperCase();
      if (curr[0] === prev[4]) links++;
    }
    return { meta, label: `${links}/2`, desc: meta.desc, done: false };
  }

  if (q.type === "HARDMODE") {
    const count = computeHardModeProgress(history);
    return { meta, label: `${count}/4`, desc: meta.desc, done: false };
  }

  if (q.type === "FIELDREPORT") {
    const count = computeFieldReportProgress(history, q.conditions);
    const conditionList = Array.isArray(q.conditions) && typeof window.formatFieldReportCondition === "function"
      ? q.conditions.map(window.formatFieldReportCondition).join(" • ")
      : "";
    return {
      meta,
      label: `${count}/8`,
      desc: conditionList ? `Conditions: ${conditionList}` : meta.desc,
      done: false
    };
  }

  if (q.type === "ALTERNATING") {
    const count = history.filter(h => questIsAlternatingWord((h.guess || "").toUpperCase())).length;
    return { meta, label: `${count}/3`, desc: meta.desc, done: false };
  }

  if (q.type === "BOOKENDS") {
    const count = history.filter(h => {
      const w = (h.guess || "").toUpperCase();
      return w.length === 5 && w[0] === w[4];
    }).length;
    return { meta, label: `${count}/3`, desc: meta.desc, done: false };
  }

  if (q.type === "REVERSEALPHA") {
    const count = history.filter(h => questIsReverseAlphaWord((h.guess || "").toUpperCase())).length;
    return { meta, label: `${count}/3`, desc: meta.desc, done: false };
  }

  if (q.type === "HALF_AM") {
    const count = history.filter(h => questIsInLetterRange((h.guess || "").toUpperCase(), "A", "P")).length;
    return { meta, label: `${count}/3`, desc: meta.desc, done: false };
  }

  if (q.type === "HALF_NZ") {
    const count = history.filter(h => questIsInLetterRange((h.guess || "").toUpperCase(), "K", "Z")).length;
    return { meta, label: `${count}/3`, desc: meta.desc, done: false };
  }

  if (q.type === "VOWELSHORTAGE") {
    const count = computeVowelShortageCount(history);
    return { meta, label: `${count}/4`, desc: meta.desc, done: false };
  }

  return null;
}
window.computeQuestStatus = computeQuestStatus;

// --------------------------------------------------
// Quest — badge tile, guesser only. Sits in the same power-container row
// as the power buttons (guesserPowerContainer) so the active quest reads
// as a card in that row, the same visual language as the setter's power
// badges -- see components.css's .quest-badge-tile, which reuses every
// .power-badge/.power-icon/.power-btn-label rule by just redefining
// --role-accent locally instead of duplicating the card CSS. The setter's
// only view of the quest stays the existing text-only InfoBadgeEngine
// registration below (screen: "both") -- this tile is purely additive.
// --------------------------------------------------
const QUEST_ICON_IDS = {
  ROW: "quest-full-sweep",
  RARE: "quest-rare-letters",
  ALPHA: "quest-in-order",
  DOUBLES: "quest-double-trouble",
  CHAIN: "quest-word-chain",
  HARDMODE: "quest-hard-mode-streak",
  FIELDREPORT: "quest-field-report",
  ALTERNATING: "quest-zigzag",
  BOOKENDS: "quest-bookends",
  REVERSEALPHA: "quest-reverse-order",
  HALF_AM: "quest-a-to-p",
  HALF_NZ: "quest-k-to-z",
  VOWELSHORTAGE: "quest-vowel-shortage"
};

let _questBadge = null;
let _questBadgeType = null;

function createQuestBadgeTile(type) {
  const wrapper = document.createElement("div");
  wrapper.className = "power-btn-wrapper";

  const btn = document.createElement("button");
  btn.className = "power-btn power-badge quest-badge-tile";

  const iconId = QUEST_ICON_IDS[type];
  if (iconId) {
    const svgNS = "http://www.w3.org/2000/svg";
    const xlinkNS = "http://www.w3.org/1999/xlink";
    const icon = document.createElementNS(svgNS, "svg");
    icon.setAttribute("class", "power-icon");
    icon.setAttribute("viewBox", "0 0 120 120");
    const use = document.createElementNS(svgNS, "use");
    use.setAttributeNS(xlinkNS, "xlink:href", `#${iconId}`);
    use.setAttribute("href", `#${iconId}`);
    icon.appendChild(use);
    btn.appendChild(icon);
  }

  const labelEl = document.createElement("span");
  labelEl.className = "power-btn-label";
  btn.appendChild(labelEl);

  const chip = document.createElement("span");
  chip.className = "quest-progress-chip";
  btn.appendChild(chip);

  wrapper.appendChild(btn);
  return { wrapper, btn, labelEl, chip };
}

// Progress text for the corner chip -- "n/m" while in progress, or a
// plain word once ready/done (no emoji/result-color glyphs here; the
// InfoBadgeEngine text badge below still uses those for its own,
// differently-scoped display).
function questCardProgressText(status, q) {
  if (status.done) return "Done";
  if (q.ready) return "Ready";
  return status.label; // "n/m" for every in-progress quest type
}

// Called from client.js's updateUI(), right next to
// maybeShowQuestProgressPop. Lazily creates the tile on first call for
// whichever screen we're on. Guesser: pinned as the first card among
// their own powers (it's their own quest). Setter: pinned as the LAST
// card in their own power list ("fit under the powers") -- their copy is
// a read-only mirror, distinguished by the blue border (--role-accent
// override below) rather than position. Re-syncs ready/one-away/done
// state and the claim handler on every render (same rebuild-in-place
// pattern as PowerEngine.updateButtonStates -- state, not the DOM, is the
// source of truth each tick).
function updateQuestBadge(state, role) {
  const containerId = role === "guesser" ? "guesserPowerContainer"
    : role === "setter" ? "setterPowerContainer"
    : null;
  const container = containerId ? document.getElementById(containerId) : null;
  const q = state.powers?.quest;

  if (!container || !q || !q.type) {
    if (_questBadge) {
      _questBadge.wrapper.remove();
      _questBadge = null;
      _questBadgeType = null;
    }
    return;
  }

  const place = () => {
    if (role === "setter") {
      if (container.lastChild !== _questBadge.wrapper) container.appendChild(_questBadge.wrapper);
    } else if (container.firstChild !== _questBadge.wrapper) {
      container.insertBefore(_questBadge.wrapper, container.firstChild);
    }
  };

  if (!_questBadge || _questBadgeType !== q.type) {
    if (_questBadge) _questBadge.wrapper.remove();
    _questBadge = createQuestBadgeTile(q.type);
    _questBadgeType = q.type;
  }
  place();

  const status = computeQuestStatus(state);
  if (!status) return;

  const { btn, labelEl, chip } = _questBadge;
  btn.title = status.meta.label;
  // Progress ("n/m", "Ready", "Done") now lives in the small corner chip
  // instead of a "Quest: <progress>" prefix line, so the label itself is
  // just the quest's name.
  labelEl.textContent = status.meta.label;
  window.fitBadgeLabel?.(labelEl);
  chip.textContent = questCardProgressText(status, q);
  chip.style.display = "";

  // Only the guesser can actually claim -- the setter's tile is a
  // read-only mirror (its blue border already marks it as "theirs, not
  // mine", see .quest-badge-tile's default --role-accent; the extra
  // transparency from quest-badge-readonly below reinforces "look, don't
  // touch" further).
  const canClaim = role === "guesser" && !status.done && (q.ready || q.oneAway);
  btn.classList.toggle("quest-badge-readonly", role !== "guesser");

  btn.classList.toggle("quest-ready", !status.done && !!q.ready);
  btn.classList.toggle("quest-oneaway", !status.done && !q.ready && !!q.oneAway);
  btn.classList.toggle("quest-done", !!status.done);
  btn.classList.toggle("power-used", !!status.done);
  btn.disabled = !canClaim;

  btn.onclick = canClaim
    ? () => window.sendGameAction?.({ type: "USE_QUEST", userId: window.currentUser?.id })
    : null;
}
window.updateQuestBadge = updateQuestBadge;

// --------------------------------------------------
// Quest used to also have a text info-badge entry here (same pattern as
// revealLetter's), kept alive only because Field Report's randomized 3
// conditions had nowhere else to be shown. The visual quest-badge-tile
// card (updateQuestBadge above) already covers name/progress/ready state
// for every quest type -- this text line just repeated it. Now that
// Field Report's conditions are logged instead (see action-log.js's
// appendRound), the whole entry was redundant and has been removed.
// --------------------------------------------------
// Quest — early claim (questServer.js's grantQuestYellowEarly emits this
// right after pushing the YELLOW extraConstraint). A quiet toast, not the
// big center-screen "power used" splash -- same reasoning as
// greenLetterRevealed's source==="quest" branch in power-functions.js:
// quests are always-on for every guesser, not an opt-in power activation,
// so the flashier treatment reads as the AI constantly firing off a power
// it never actually has.
// --------------------------------------------------
// Quest — increment pop. Progress now ticks up the instant the guesser
// submits a guess (see questServer.js's onGuessSubmitted), not only once
// the setter has reacted, so a purely re-rendered number is easy to miss.
// Reuses showScorePop's ".score-pop" floating "+1" (client.js) positioned
// over the quest badge instead of the header score, same append-to-body /
// animationend-cleanup pattern for the same reason: the badge's innerHTML
// gets fully rebuilt by InfoBadgeEngine.render() on every state update,
// which would cut a listener-bound animation short.
// --------------------------------------------------
let _questPopSeen = { type: null, count: null, ready: false };

function maybeShowQuestProgressPop(state) {
  const q = state.powers?.quest;
  if (!q || !q.type || q.used) {
    _questPopSeen = { type: null, count: null, ready: false };
    return;
  }
  if (q.type !== _questPopSeen.type) {
    // New quest (fresh round, or role swap) -- nothing to compare against
    // yet, so this render can't be an "increase".
    _questPopSeen = { type: q.type, count: null, ready: false };
  }

  const status = computeQuestStatus(state);
  // Once ready, computeQuestStatus swaps the "n/m" fraction for "Ready!" --
  // the final increment is caught separately below via q.ready instead.
  const match = status && !q.ready ? /^(\d+)\// .exec(status.label) : null;
  const count = match ? Number(match[1]) : null;

  const numericIncrease = count != null && _questPopSeen.count != null && count > _questPopSeen.count;
  const justBecameReady = q.ready && !_questPopSeen.ready;

  if (numericIncrease || justBecameReady) {
    const badge = document.querySelector(".quest-badge-tile") || document.querySelector(".badge-quest");
    if (badge) {
      const rect = badge.getBoundingClientRect();
      const pop = document.createElement("span");
      pop.className = "score-pop";
      pop.textContent = "+1";
      pop.style.left = `${rect.left + rect.width / 2}px`;
      pop.style.top = `${rect.top}px`;
      document.body.appendChild(pop);
      pop.addEventListener("animationend", () => pop.remove(), { once: true });
    }
  }

  if (count != null) _questPopSeen.count = count;
  _questPopSeen.ready = !!q.ready;
}
window.maybeShowQuestProgressPop = maybeShowQuestProgressPop;

socket.on("questEarlyClaim", ({ questType, letter }) => {
  const meta = window.QUEST_METADATA?.[questType];
  const label = meta?.label || "Quest";
  toast(
    letter
      ? `${label} claimed early! ${letter.toUpperCase()} is somewhere in the secret.`
      : `${label} claimed early, but nothing new was left to reveal.`
  );
});
