// client/quest.js — Guesser Quests
//
// Renders the always-on quest progress box (left of the guesser's power
// buttons, see #GuesserQuestBox in index.html + .quest-and-powers-row in
// features.css) and mirrors the server's unlock thresholds so the
// progress readout updates instantly from public history data, same
// pattern as powerEngine/powers/revealLetter.js's
// computeRevealLetterStatus (kept in sync manually -- the server in
// questServer.js is the source of truth for when a quest actually
// unlocks).
//
// "Openly known to both players": this box only lives on the guesser's
// own screen (mirrors where revealLetter's button used to live), but the
// InfoBadgeEngine registration below also surfaces the quest's type and
// live progress on BOTH screens via the shared info-badge strip, so the
// setter isn't left guessing what the guesser is working toward.
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

// Mirrors questServer.js's computeVowelProgressionStage exactly.
function computeVowelProgressionStage(history) {
  const targets = [1, 2, 3, 4];
  let stage = 0;
  for (const entry of history) {
    if (stage >= targets.length) break;
    if (!entry?.guess) continue;
    if (questCountVowels(entry.guess.toUpperCase()) === targets[stage]) stage++;
  }
  return stage;
}

// Mirrors questServer.js's computeHardModeCount exactly.
function computeHardModeProgress(history) {
  const green = [null, null, null, null, null];
  const mustInclude = new Set();
  let count = 0;

  for (const entry of history) {
    const fb = entry.fbGuesser || entry.fb;
    if (!Array.isArray(fb) || !entry.guess) continue;
    const g = entry.guess.toUpperCase();

    let compliant = true;
    for (let i = 0; i < 5; i++) {
      if (green[i] && g[i] !== green[i]) compliant = false;
    }
    for (const letter of mustInclude) {
      if (!g.includes(letter)) compliant = false;
    }
    if (compliant) count++;

    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟩") green[i] = g[i];
      else if (fb[i] === "🟨") mustInclude.add(g[i]);
    }
  }

  return count;
}

function computeFieldReportProgress(history, conditions) {
  if (!Array.isArray(conditions) || !conditions.length) return 0;
  let count = 0;
  for (const entry of history) {
    if (!entry?.guess || typeof satisfiesForceGuessClient !== "function") continue;
    const metCount = conditions.filter(c => satisfiesForceGuessClient(entry.guess.toUpperCase(), c)).length;
    if (metCount >= 2) count++;
  }
  return count;
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
    if (q.claimedEarly) {
      return {
        meta,
        label: "Claimed early",
        desc: "Yellow letter revealed early — no green letter for this quest.",
        done: true,
        claimedEarly: true
      };
    }
    return { meta, label: "Complete!", desc: "Free green letter revealed.", done: true };
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
    return { meta, label: `${seen.size}/4`, desc: meta.desc, done: false };
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
      label: `${count}/3`,
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
    const count = history.filter(h => questIsInLetterRange((h.guess || "").toUpperCase(), "A", "M")).length;
    return { meta, label: `${count}/3`, desc: meta.desc, done: false };
  }

  if (q.type === "HALF_NZ") {
    const count = history.filter(h => questIsInLetterRange((h.guess || "").toUpperCase(), "N", "Z")).length;
    return { meta, label: `${count}/3`, desc: meta.desc, done: false };
  }

  if (q.type === "VOWELPROGRESSION") {
    const stage = computeVowelProgressionStage(history);
    return { meta, label: `${stage}/4`, desc: meta.desc, done: false };
  }

  return null;
}
window.computeQuestStatus = computeQuestStatus;

window.renderQuestBox = function (state) {
  const box = document.getElementById("GuesserQuestBox");
  if (!box) return;

  const status = computeQuestStatus(state);
  if (!status) {
    box.hidden = true;
    box.onclick = null;
    return;
  }

  const q = state.powers?.quest;
  const claimable = !!q?.oneAway && !status.done;

  box.hidden = false;
  box.classList.toggle("quest-done", !!status.done);
  box.classList.toggle("quest-claimable", claimable);

  const guideOn = document.body.classList.contains("guide-on");
  const hintHtml = claimable
    ? `<div class="quest-claim-hint">Tap for an early 🟨 (forfeits the 🟩)</div>`
    : "";
  const descHtml = guideOn ? `<div class="quest-desc">${status.desc}</div>` : "";

  box.innerHTML = `
    <div class="quest-title">${status.meta.emoji || "🎯"} ${status.meta.label} — ${status.label}</div>
    ${hintHtml}
    ${descHtml}
  `;

  box.onclick = claimable
    ? () => window.sendGameAction?.({ type: "USE_QUEST_EARLY", userId: window.currentUser?.id })
    : null;
};

// --------------------------------------------------
// Quest — info badge (both players), same pattern as revealLetter's.
// --------------------------------------------------
InfoBadgeEngine.register((state, role) => {
  const q = state.powers?.quest;
  if (!q || !q.type) return null;
  const status = computeQuestStatus(state);
  if (!status) return null;

  return {
    id: "quest",
    emoji: status.meta.emoji ?? "🎯",
    text: status.done
      ? (status.claimedEarly
        ? `Quest claimed early: ${status.meta.label}`
        : `Quest complete: ${status.meta.label}`)
      : `Quest: ${status.meta.label} (${status.label})`,
    color: status.meta.color,
    priority: 12,
    screen: "both",
    details: status.desc
  };
});

// --------------------------------------------------
// Quest — early claim popup (mirrors fieldReportResult's yellow-reward
// popup in power-functions.js; questServer.js's grantQuestYellowEarly
// emits this right after pushing the YELLOW extraConstraint).
// --------------------------------------------------
socket.on("questEarlyClaim", ({ questType, letter }) => {
  const meta = window.QUEST_METADATA?.[questType];
  window.showBigAnnounce?.({
    icon: letter ? "🟨" : "🎯",
    title: `${meta?.label || "Quest"} claimed early!`,
    sub: letter
      ? `${letter.toUpperCase()} is somewhere in the secret. No green letter later — the quest is used.`
      : "Nothing new left to reveal — the quest is used.",
    roleClass: letter ? "outcome-win" : "",
    duration: 4200
  });
});
