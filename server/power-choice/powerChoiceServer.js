"use strict";

const engine = require("../powers/powerEngineServer");
const CompetitiveMode = require("../core/modes/competitiveMode");
const spyChargeServer = require("../powers/powers/spyChargeServer");
const POWER_METADATA = require("../powers/powerMetadata");
const { eraseLetterKnowledge } = require("../utils/resetLetterKnowledge");
const { satisfiesForceGuess } = require("../game-engine/validation");
const { generateConditions } = require("../powers/powers/fieldReportServer");
const { emitRoomState } = require("../core/rooms");
const { isConsistentWithHistory } = require("../game-engine/history");
const {
  getCoverAnalysis,
  getCandidateRemainingCount
} = require("../utils/coverStrength");
const { randomPool, tierFor } = require("./powerTiers");

const MODE = "powerChoice";
const SPY_THRESHOLDS = [5, 8, 15];
// Quests no longer build toward a shared points meter -- each quest met
// grants a reward immediately, cycling through these same three tiers
// (fixedOptions/threePowerOptions below dispatch on these threshold
// numbers, unchanged from when they were meter milestones).
const INSPECTOR_REWARD_SEQUENCE = [2, 3, 5];
const VOWELS = new Set("AEIOU");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const QUEST_TYPES = [
  "ROW_LIMIT",
  "ROW_ONLY",
  "ROW_AVOID",
  "RARE",
  "ALPHA",
  "DOUBLES",
  "HARDMODE",
  "FIELDREPORT",
  "ALTERNATING",
  "BOOKENDS",
  "HALF_AM",
  "HALF_NZ",
  "VOWELSHORTAGE"
];

// Power Choice AI tuning. These are intentionally separate from the generic
// Wordle AI knobs so the mode can be balanced without changing other modes.
const AI_BEHAVIOR = Object.freeze({
  1: Object.freeze({
    spy: Object.freeze({ topHint: 0.25, keep: 0.40, worse: 0.35 }),
    inspector: Object.freeze({ chaseQuest: 0.30 })
  }),
  2: Object.freeze({
    spy: Object.freeze({ topHint: 0.55, keep: 0.25, worse: 0.20 }),
    inspector: Object.freeze({ chaseQuest: 0.50 })
  }),
  3: Object.freeze({
    spy: Object.freeze({ topHint: 0.80, keep: 0.12, worse: 0.08 }),
    inspector: Object.freeze({ chaseQuest: 0.68 })
  })
});

const POWER_COPY = {
  confuseColors: ["🎨", "Blue Mode", "Scramble the Inspector's feedback colors this turn."],
  countOnly: ["🔢", "Count Only", "Show only the number of matching letters this turn."],
  fakeFeedback: ["🎭", "Fake Feedback", "Distort the feedback from the next resolved guess."],
  blindGuess: ["🙈", "Blind Guess", "Hide the Inspector's draft while they make this guess."],
  forceTimer: ["⏱", "Force Timer", "Put immediate time pressure on the Inspector's turn."],
  delayedIntel: ["📡", "Delayed Intel", "Delay the Inspector's feedback for this turn."],
  revealGreen: ["🟩", "Sneak Letter", "Reveal a random correct letter in its exact position."],
  freezeSecret: ["🧊", "Freeze Secret", "The Spy cannot change the secret after this guess."],
  rouletteSecret: ["🎰", "Roulette Secret", "Force the Spy onto a legal random secret."],
  stealthGuess: ["🥷", "Stealth Guess", "Hide this guess during the Spy's Keep/New decision."],
  nonsense: ["🌀", "Signal Scramble", "Scramble the Spy's information for this turn."],
  magicMode: ["✨", "Magic Mode", "Activate the Inspector's special feedback mode this turn."]
};

function normalizeWord(value) {
  return String(value || "").trim().toUpperCase();
}

function wordOf(row) {
  return normalizeWord(typeof row === "string" ? row : row?.word);
}

function pick(array) {
  return array?.length ? array[Math.floor(Math.random() * array.length)] : null;
}

function shuffle(array) {
  const out = [...(array || [])];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function weightedPick(items, weightFor) {
  const weighted = (items || [])
    .map(item => ({ item, weight: Math.max(0, Number(weightFor(item)) || 0) }))
    .filter(entry => entry.weight > 0);
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (!total) return null;
  let roll = Math.random() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return weighted[weighted.length - 1]?.item || null;
}

function isPowerChoice(state) {
  return !!(
    state &&
    state.gameMode === MODE &&
    !state.isTutorial &&
    !state.isDaily &&
    !state.devMode
  );
}

function freshSpyCharge() {
  return {
    enabled: true,
    total: 0,
    hint: null,
    lockedPowerId: null,
    resetsUsed: 0,
    resetLetters: []
  };
}

function freshPowerChoice(roundIndex) {
  return {
    enabled: true,
    version: 2,
    roundIndex: Number(roundIndex) || 0,
    spy: {
      queuedMilestones: [],
      claimedMilestones: [],
      usedPowerIds: []
    },
    inspector: {
      queuedMilestones: [],
      claimedMilestones: [],
      usedPowerIds: [],
      currentQuest: null,
      questTurnsElapsed: 0,
      questCompletions: 0,
      attempts: 0,
      successes: 0,
      lastResult: null
    },
    pendingChoice: null,
    // Actually blocks the guesser from using these letters (server rejects
    // guesses that include one, client disables + X's the key).
    eliminatedLetters: [],
    // Informational only -- letters known to be absent, but still usable;
    // the client just styles them like any other already-guessed absent
    // letter instead of blocking them.
    ruledOutLetters: [],
    bonusTimeTurnKeys: [],
    lastResolution: null,
    resolutionLog: []
  };
}

function ensureFieldReportConditions() {
  for (let attempt = 0; attempt < 40; attempt++) {
    const conditions = generateConditions() || [];
    const kinds = new Set(conditions.map(condition => condition?.type));
    const repetitive =
      kinds.has("firstLastSame") &&
      kinds.has("startsWith") &&
      kinds.has("endsWith");
    if (conditions.length === 3 && !repetitive) return conditions;
  }
  return [
    { type: "startsWith", letter: pick(ALPHABET) },
    { type: "minVowels", count: 2 },
    { type: "doubleLetter", letter: null }
  ];
}

function conditionText(condition) {
  if (!condition) return "Match the condition";
  switch (condition.type) {
    case "startsWith":
      return `Start with ${condition.letter}`;
    case "endsWith":
      return `End with ${condition.letter}`;
    case "doubleLetter":
      return condition.letter
        ? `Use double ${condition.letter}`
        : "Use a doubled letter";
    case "minVowels":
      return `Use at least ${condition.count} vowels`;
    case "maxVowels":
      return `Use at most ${condition.count} vowels`;
    case "firstLastSame":
      return "Use the same first and last letter";
    case "palindrome":
      return "Make a palindrome";
    default:
      return "Match the condition";
  }
}

function makeQuest(excludeType = null) {
  const available = QUEST_TYPES.filter(type => type !== excludeType);
  const type = pick(available) || "ALPHA";
  const id = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  if (type === "ROW_LIMIT") {
    return {
      id,
      type,
      icon: "⌨",
      title: "Spread Out",
      description: "Use at most 2 letters from any single keyboard row."
    };
  }
  if (type === "ROW_ONLY") {
    return {
      id,
      type,
      icon: "⌨",
      title: "One Row",
      description: "Use letters from only one keyboard row -- any row."
    };
  }
  if (type === "ROW_AVOID") {
    const avoidRow = pick(KEYBOARD_ROWS);
    return {
      id,
      type,
      icon: "⌨",
      title: "Skip a Row",
      description: `Avoid every letter in ${avoidRow}.`,
      avoidRow
    };
  }
  if (type === "RARE") {
    const letters = shuffle("QJXZWKVFYBHGCMPD".split("")).slice(0, 5);
    return {
      id,
      type,
      icon: "◆",
      title: "Rare Letter",
      description: `Use at least one of: ${letters.join(" · ")}.`,
      letters
    };
  }
  if (type === "ALPHA") {
    return {
      id,
      type,
      icon: "↗",
      title: "In Order",
      description: "Letters must be strictly alphabetical, forward or backward."
    };
  }
  if (type === "DOUBLES") {
    return {
      id,
      type,
      icon: "Ⅱ",
      title: "Double Trouble",
      description: "Use the same letter twice in a row."
    };
  }
  if (type === "HARDMODE") {
    return {
      id,
      type,
      icon: "◆",
      title: "Hard Mode",
      description: "Honor every green and yellow clue already known."
    };
  }
  if (type === "FIELDREPORT") {
    const conditions = ensureFieldReportConditions();
    return {
      id,
      type,
      icon: "▤",
      title: "Field Report",
      description: "Satisfy all three listed conditions in one guess.",
      conditions,
      conditionLabels: conditions.map(conditionText)
    };
  }
  if (type === "ALTERNATING") {
    return {
      id,
      type,
      icon: "〰",
      title: "Alternating",
      description: "Alternate vowels and consonants across all five letters."
    };
  }
  if (type === "BOOKENDS") {
    return {
      id,
      type,
      icon: "◉",
      title: "Bookends",
      description: "Use the same first and last letter."
    };
  }
  if (type === "HALF_AM") {
    return {
      id,
      type,
      icon: "A–P",
      title: "First Half",
      description: "Use only letters A through P."
    };
  }
  if (type === "HALF_NZ") {
    return {
      id,
      type,
      icon: "K–Z",
      title: "Second Half",
      description: "Use only letters K through Z."
    };
  }
  const vowelTarget = pick([1, 2, 3]);
  return {
    id,
    type,
    icon: "◌",
    title: "Vowel Count",
    description: `Use exactly ${vowelTarget} vowel${vowelTarget === 1 ? "" : "s"}.`,
    vowelTarget
  };
}

function knownClues(state) {
  const greenByIndex = new Map();
  const yellowLetters = new Set();
  for (const entry of state.history || []) {
    const guess = normalizeWord(entry?.guess);
    const fb = Array.isArray(entry?.fbGuesser) ? entry.fbGuesser : entry?.fb;
    if (!Array.isArray(fb)) continue;
    for (let i = 0; i < 5; i++) {
      const mark = String(fb[i] || "").toLowerCase();
      if (mark.includes("🟩") || mark === "green" || mark === "g") {
        greenByIndex.set(i, guess[i]);
      }
      if (mark.includes("🟨") || mark === "yellow" || mark === "y") {
        yellowLetters.add(guess[i]);
      }
    }
  }
  for (const constraint of state.extraConstraints || []) {
    const type = String(constraint?.type || "").toUpperCase();
    if (
      type === "GREEN" &&
      Number.isInteger(constraint.index) &&
      constraint.letter
    ) {
      greenByIndex.set(constraint.index, normalizeWord(constraint.letter)[0]);
    }
    if (type === "YELLOW" && constraint.letter) {
      yellowLetters.add(normalizeWord(constraint.letter)[0]);
    }
  }
  return { greenByIndex, yellowLetters };
}

function hardModeCompliant(state, word) {
  const { greenByIndex, yellowLetters } = knownClues(state);
  for (const [index, letter] of greenByIndex) {
    if (word[index] !== letter) return false;
  }
  for (const letter of yellowLetters) {
    if (letter && !word.includes(letter)) return false;
  }
  return true;
}

function evaluateFieldReportConditions(quest, guess) {
  const word = normalizeWord(guess);
  if (!/^[A-Z]{5}$/.test(word)) {
    return (quest?.conditions || []).map(() => false);
  }
  return (quest?.conditions || []).map(condition =>
    satisfiesForceGuess(word, condition)
  );
}

function evaluateQuest(state, quest, guess) {
  const word = normalizeWord(guess);
  if (!/^[A-Z]{5}$/.test(word) || !quest) return false;
  switch (quest.type) {
    case "ROW_LIMIT":
      return KEYBOARD_ROWS.every(
        row => [...word].filter(letter => row.includes(letter)).length <= 2
      );
    case "ROW_ONLY":
      return KEYBOARD_ROWS.some(row => [...word].every(letter => row.includes(letter)));
    case "ROW_AVOID":
      return [...word].every(letter => !String(quest.avoidRow || "").includes(letter));
    case "RARE":
      return quest.letters.some(letter => word.includes(letter));
    case "ALPHA": {
      const codes = [...word].map(letter => letter.charCodeAt(0));
      return (
        codes.every((value, index) => index === 0 || value > codes[index - 1]) ||
        codes.every((value, index) => index === 0 || value < codes[index - 1])
      );
    }
    case "DOUBLES":
      return /(.)\1/.test(word);
    case "HARDMODE":
      return hardModeCompliant(state, word);
    case "FIELDREPORT": {
      const results = evaluateFieldReportConditions(quest, word);
      return results.length === 3 && results.every(Boolean);
    }
    case "ALTERNATING":
      return [...word].every(
        (letter, index) =>
          index === 0 || VOWELS.has(letter) !== VOWELS.has(word[index - 1])
      );
    case "BOOKENDS":
      return word[0] === word[4];
    case "HALF_AM":
      return [...word].every(letter => letter >= "A" && letter <= "P");
    case "HALF_NZ":
      return [...word].every(letter => letter >= "K" && letter <= "Z");
    case "VOWELSHORTAGE":
      return [...word].filter(letter => VOWELS.has(letter)).length === quest.vowelTarget;
    default:
      return false;
  }
}

function initializeRound(state) {
  if (!isPowerChoice(state) || !state.powers) return;
  const roundIndex = Number(state.roundIndex) || 0;
  const freshRound =
    !state.powerChoice || state.powerChoice.roundIndex !== roundIndex;
  if (freshRound) state.powerChoice = freshPowerChoice(roundIndex);

  const pc = state.powerChoice;
  pc.enabled = true;
  pc.version = 2;
  pc.spy ||= { queuedMilestones: [], claimedMilestones: [], usedPowerIds: [] };
  pc.inspector ||= {
    queuedMilestones: [],
    claimedMilestones: [],
    usedPowerIds: [],
    currentQuest: null,
    questTurnsElapsed: 0,
    questCompletions: 0,
    attempts: 0,
    successes: 0,
    lastResult: null
  };
  pc.inspector.currentQuest ||= makeQuest();
  pc.eliminatedLetters ||= [];
  pc.ruledOutLetters ||= [];
  pc.bonusTimeTurnKeys ||= [];

  // Reward powers are applied immediately when selected. They are never
  // added to the normal loadout, so neither a human nor the generic AI can
  // save or fire the same reward again on a later turn.
  state.activePowers = [];
  state.initialPowers = { setter: [], guesser: [] };
  state.customPlayerPowers = null;
  if (freshRound || !state.powers.spyCharge?.enabled) {
    state.powers.spyCharge = freshSpyCharge();
  }
  if (state.powers.quest) {
    state.powers.quest.type = null;
    state.powers.quest.pendingChoice = null;
    state.powers.quest.ready = false;
    state.powers.quest.used = true;
    state.powers.quest.conditions = null;
  }
  state.powers.questActive = false;
}

function queueCrossed(before, after, thresholds, queue, claimed) {
  for (const threshold of thresholds) {
    if (
      before < threshold &&
      after >= threshold &&
      !claimed.includes(threshold) &&
      !queue.includes(threshold)
    ) {
      queue.push(threshold);
    }
  }
  queue.sort((a, b) => a - b);
}

function powerOption(powerId) {
  const fallback = POWER_METADATA[powerId]?.label || powerId;
  const [icon, title, description] = POWER_COPY[powerId] || [
    "⚡",
    fallback,
    "Activate this power for the current turn."
  ];
  return {
    id: `power:${powerId}`,
    kind: "power",
    powerId,
    icon,
    title,
    description,
    tier: tierFor(powerId)
  };
}

function threePowerOptions(state, role, usedPowerIds) {
  // These powers can be applied immediately without asking for a second
  // payload (letter, word, position, bet amount, and so on).
  const immediate =
    role === "setter"
      ? [
          "confuseColors",
          "countOnly",
          "fakeFeedback",
          "blindGuess",
          "forceTimer",
          "delayedIntel"
        ]
      : [
          "revealGreen",
          "freezeSecret",
          "rouletteSecret",
          "stealthGuess",
          "nonsense",
          "magicMode"
        ];
  const tiered = randomPool(role).filter(id => immediate.includes(id));
  const applicable = tiered.filter(id => powerOptionApplicable(state, powerOption(id)));
  let candidates = applicable.filter(id => !usedPowerIds.includes(id));
  if (candidates.length < 3) candidates = applicable;
  return shuffle(candidates).slice(0, 3).map(powerOption);
}

function fixedOptions(role, threshold) {
  if (role === "setter" && threshold === 5) {
    return [
      {
        id: "spy-reset-positive-1",
        kind: "fixed",
        icon: "↶",
        title: "Erase One Clue",
        description: "Reset one random yellow or green letter."
      },
      {
        id: "spy-reset-known-2",
        kind: "fixed",
        icon: "◇◇",
        title: "Erase Two Clues",
        description: "Reset two random known letters, including gray letters."
      },
      {
        id: "spy-add-point-1",
        kind: "fixed",
        icon: "+1",
        title: "Add a Point",
        description: "Add 1 point to the Inspector's final guess total."
      }
    ];
  }
  if (role === "setter" && threshold === 15) {
    return [
      {
        id: "spy-reset-positive-2",
        kind: "fixed",
        icon: "↶↶",
        title: "Erase Two Colors",
        description: "Reset two random yellow or green letters."
      },
      {
        id: "spy-reset-vowels",
        kind: "fixed",
        icon: "AEIOU",
        title: "Erase Vowels",
        description: "Reset all learned information about vowels."
      },
      {
        id: "spy-add-point-2",
        kind: "fixed",
        icon: "+2",
        title: "Add Two Points",
        description: "Add 2 points to the Inspector's final guess total."
      }
    ];
  }
  if (role === "guesser" && threshold === 2) {
    return [
      {
        id: "inspector-yellow-1",
        kind: "fixed",
        icon: "🟨",
        title: "Yellow Intel",
        description: "Reveal one random letter that is in the secret."
      },
      {
        id: "inspector-remove-unused-2",
        kind: "fixed",
        icon: "×3",
        title: "Rule Out Three",
        description: "Learn three random unused letters that are not in the secret."
      },
      {
        id: "inspector-remove-point-1",
        kind: "fixed",
        icon: "−1",
        title: "Remove a Point",
        description: "Subtract 1 point from your final guess total."
      },
      {
        id: "inspector-block-unused-4",
        kind: "fixed",
        icon: "×4",
        title: "Lock Out Four",
        description: "Block four random unused letters -- you won't be able to use them at all."
      }
    ];
  }
  if (role === "guesser" && threshold === 5) {
    return [
      {
        id: "inspector-green-1",
        kind: "fixed",
        icon: "🟩",
        title: "Green Intel",
        description: "Reveal one random letter in its exact position."
      },
      {
        id: "inspector-yellow-to-green-2",
        kind: "fixed",
        icon: "🟨→🟩",
        title: "Promote Clues",
        description: "Turn up to two known yellow letters into green positions."
      },
      {
        id: "inspector-remove-point-2",
        kind: "fixed",
        icon: "−2",
        title: "Remove Two Points",
        description: "Subtract 2 points from your final guess total."
      }
    ];
  }
  return [];
}

// Trims a fixed-reward group down to three cards. Options that would do
// nothing right now (fixedOptionApplicable === false) are dropped first,
// so a random trim can't leave the player staring at three dead cards
// while a usable one was silently cut.
function pickThree(state, options) {
  const list = Array.isArray(options) ? options : [];
  if (list.length <= 3) return list;
  const usable = list.filter(option => fixedOptionApplicable(state, option));
  const rest = list.filter(option => !usable.includes(option));
  return shuffle(usable).concat(shuffle(rest)).slice(0, 3);
}

function buildChoice(state, role, threshold, owner) {
  const side =
    role === "setter" ? state.powerChoice.spy : state.powerChoice.inspector;
  const randomMilestone =
    (role === "setter" && threshold === 8) ||
    (role === "guesser" && threshold === 3);
  // Always exactly three cards to pick from. Some fixed groups define
  // more than three candidates (so the pool can vary between rewards) --
  // narrow those down to a random three rather than widening the row.
  const options = randomMilestone
    ? threePowerOptions(state, role, side.usedPowerIds)
    : pickThree(state, fixedOptions(role, threshold));
  return {
    id: `${role}-${threshold}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    ownerUserId: owner,
    role,
    threshold,
    title:
      role === "setter"
        ? `Spy reward · ${threshold} stars`
        : "Inspector reward · Quest complete",
    subtitle: "Choose one card. It activates immediately and cannot be saved.",
    options
  };
}

function addChoiceTime(state, owner, choiceId) {
  if (!state.timeControl?.enabled || !owner) return;
  const keys = state.powerChoice.bonusTimeTurnKeys;
  const key = `${choiceId}:${owner}`;
  if (keys.includes(key)) return;
  state.timeRemaining ||= {};
  state.timeRemaining[owner] =
    Math.max(0, Number(state.timeRemaining[owner]) || 0) + 30;
  keys.push(key);
}

function maybeOpenChoice(state) {
  if (
    !isPowerChoice(state) ||
    state.gameOver ||
    state.phase !== "normal"
  ) {
    return;
  }
  initializeRound(state);
  const pc = state.powerChoice;
  if (pc.pendingChoice || !state.turn) return;
  const role =
    state.turn === state.setter
      ? "setter"
      : state.turn === state.guesser
        ? "guesser"
        : null;
  if (!role) return;
  const side = role === "setter" ? pc.spy : pc.inspector;
  const threshold = side.queuedMilestones.shift();
  if (!threshold) return;
  if (!side.claimedMilestones.includes(threshold)) {
    side.claimedMilestones.push(threshold);
  }
  pc.pendingChoice = buildChoice(state, role, threshold, state.turn);
  addChoiceTime(state, state.turn, pc.pendingChoice.id);
}

function feedbackLetters(state, positiveOnly) {
  const letters = new Set();
  for (const entry of state.history || []) {
    const word = normalizeWord(entry?.guess);
    const fb = Array.isArray(entry?.fbGuesser) ? entry.fbGuesser : entry?.fb;
    if (!Array.isArray(fb)) continue;
    for (let i = 0; i < 5; i++) {
      const mark = String(fb[i] || "").toLowerCase();
      const positive =
        mark.includes("🟩") ||
        mark.includes("🟨") ||
        ["green", "yellow", "g", "y"].includes(mark);
      const known = !!mark && mark !== "?" && mark !== "❓";
      if ((positiveOnly ? positive : known) && word[i]) letters.add(word[i]);
    }
  }
  for (const constraint of state.extraConstraints || []) {
    const type = String(constraint?.type || "").toUpperCase();
    if (
      constraint?.letter &&
      (positiveOnly ? type === "GREEN" || type === "YELLOW" : true)
    ) {
      letters.add(normalizeWord(constraint.letter)[0]);
    }
  }
  return [...letters].filter(Boolean);
}

function resetRandom(state, count, positiveOnly) {
  const selected = shuffle(feedbackLetters(state, positiveOnly)).slice(0, count);
  if (selected.length) eraseLetterKnowledge(state, selected);
  return selected;
}

function resetKnownVowels(state) {
  const selected = feedbackLetters(state, false).filter(letter => VOWELS.has(letter));
  if (selected.length) eraseLetterKnowledge(state, selected);
  return selected;
}

function addYellow(state) {
  const known = new Set(feedbackLetters(state, true));
  const candidates = [...new Set(normalizeWord(state.secret).split(""))].filter(
    letter => !known.has(letter)
  );
  const letter = pick(candidates);
  if (!letter) return null;
  state.extraConstraints ||= [];
  if (
    !state.extraConstraints.some(
      constraint =>
        String(constraint.type).toUpperCase() === "YELLOW" &&
        normalizeWord(constraint.letter)[0] === letter
    )
  ) {
    state.extraConstraints.push({ type: "YELLOW", letter });
  }
  return letter;
}

function knownGreenIndexes(state) {
  return new Set(knownClues(state).greenByIndex.keys());
}

function addGreen(state) {
  const secret = normalizeWord(state.secret);
  const known = knownGreenIndexes(state);
  const index = pick(
    [0, 1, 2, 3, 4].filter(position => secret[position] && !known.has(position))
  );
  if (index == null) return null;
  state.extraConstraints ||= [];
  state.extraConstraints.push({ type: "GREEN", index, letter: secret[index] });
  return { index, letter: secret[index] };
}

function promotableYellows(state) {
  const secret = normalizeWord(state.secret);
  const { yellowLetters } = knownClues(state);
  const knownGreen = knownGreenIndexes(state);
  return [...yellowLetters]
    .map(letter => ({
      letter,
      index: [...secret].findIndex(
        (candidate, position) => candidate === letter && !knownGreen.has(position)
      )
    }))
    .filter(item => item.index >= 0);
}

function promoteYellows(state, count) {
  const promoted = [];
  const knownGreen = knownGreenIndexes(state);
  for (const item of shuffle(promotableYellows(state))) {
    if (knownGreen.has(item.index)) continue;
    state.extraConstraints ||= [];
    state.extraConstraints = state.extraConstraints.filter(
      constraint =>
        !(
          String(constraint.type).toUpperCase() === "YELLOW" &&
          normalizeWord(constraint.letter)[0] === item.letter
        )
    );
    state.extraConstraints.push({
      type: "GREEN",
      index: item.index,
      letter: item.letter
    });
    knownGreen.add(item.index);
    promoted.push(item);
    if (promoted.length >= count) break;
  }
  return promoted;
}

function unusedLetterCandidates(state) {
  const secretLetters = new Set(normalizeWord(state.secret));
  const used = new Set(
    (state.history || []).flatMap(entry => normalizeWord(entry?.guess).split(""))
  );
  const eliminated = new Set(state.powerChoice?.eliminatedLetters || []);
  const ruledOut = new Set(state.powerChoice?.ruledOutLetters || []);
  return ALPHABET.filter(
    letter =>
      !secretLetters.has(letter) &&
      !used.has(letter) &&
      !eliminated.has(letter) &&
      !ruledOut.has(letter)
  );
}

// Actually blocks the letters from being typed (see the SUBMIT_GUESS
// check and markEliminatedKeys() client-side).
function removeUnusedLetters(state, count) {
  const selected = shuffle(unusedLetterCandidates(state)).slice(0, count);
  const eliminated = new Set(state.powerChoice.eliminatedLetters || []);
  for (const letter of selected) eliminated.add(letter);
  state.powerChoice.eliminatedLetters = [...eliminated];
  return selected;
}

// First locked-out letter appearing in `word`, or null. Locked-out letters
// bind BOTH roles: the Inspector can't guess them and the Spy can't hide
// behind them in the secret.
function blockedLetterIn(state, word) {
  const blocked = state.powerChoice?.eliminatedLetters || [];
  if (!blocked.length || !word) return null;
  return blocked.find(letter => word.includes(letter)) || null;
}

// Informational only -- the letters are known-absent but stay usable; the
// client just styles them like any other already-guessed absent letter.
function ruleOutUnusedLetters(state, count) {
  const selected = shuffle(unusedLetterCandidates(state)).slice(0, count);
  const ruledOut = new Set(state.powerChoice.ruledOutLetters || []);
  for (const letter of selected) ruledOut.add(letter);
  state.powerChoice.ruledOutLetters = [...ruledOut];
  return selected;
}

function powerOptionApplicable(state, option) {
  if (!option || option.kind !== "power") return false;
  if (!engine.powers?.[option.powerId]?.apply) return false;
  switch (option.powerId) {
    case "revealGreen":
      return knownGreenIndexes(state).size < 5;
    case "freezeSecret":
    case "rouletteSecret":
      return !state.simultaneousAllWrong;
    case "magicMode":
      // Magic Mode affects feedback from the upcoming guess, so it remains
      // useful even when no yellow was known before this turn.
      return true;
    default:
      return true;
  }
}

function fixedOptionApplicable(state, option) {
  switch (option?.id) {
    case "spy-reset-positive-1":
    case "spy-reset-positive-2":
      return feedbackLetters(state, true).length > 0;
    case "spy-reset-known-2":
      return feedbackLetters(state, false).length > 0;
    case "spy-reset-vowels":
      return feedbackLetters(state, false).some(letter => VOWELS.has(letter));
    case "spy-add-point-1":
    case "spy-add-point-2":
      return true;
    case "inspector-yellow-1": {
      const known = new Set(feedbackLetters(state, true));
      return [...new Set(normalizeWord(state.secret))].some(letter => !known.has(letter));
    }
    case "inspector-remove-unused-2":
    case "inspector-block-unused-4":
      return unusedLetterCandidates(state).length > 0;
    case "inspector-remove-point-1":
    case "inspector-remove-point-2":
      return (Number(state.guessCount) || 0) > 0;
    case "inspector-green-1":
      return knownGreenIndexes(state).size < 5;
    case "inspector-yellow-to-green-2":
      return promotableYellows(state).length > 0;
    default:
      return false;
  }
}

function optionApplicable(state, option) {
  return option?.kind === "power"
    ? powerOptionApplicable(state, option)
    : fixedOptionApplicable(state, option);
}

function buildAIChoiceAction(state, aiUserId) {
  if (!isPowerChoice(state)) return null;
  initializeRound(state);
  const pending = state.powerChoice.pendingChoice;
  if (!pending || pending.ownerUserId !== aiUserId) return null;
  const pool = (pending.options || []).filter(option =>
    optionApplicable(state, option)
  );
  if (!pool.length) return null;

  // Fixed milestone cards use the requested 40/40/20 weighting: point
  // manipulation gets half the weight of either information-changing card.
  const chosen = weightedPick(pool, option => {
    if (option.kind === "power") return 1;
    return /point/i.test(option.id) ? 0.20 : 0.40;
  });
  if (!chosen) return null;
  return {
    type: "POWER_CHOICE_SELECT",
    choiceId: pending.id,
    optionId: chosen.id
  };
}

function effectDetailText(option, detail) {
  const letters = (detail?.letters || []).filter(Boolean);
  switch (option.id) {
    case "spy-reset-positive-1":
    case "spy-reset-known-2":
    case "spy-reset-positive-2":
    case "spy-reset-vowels":
      return letters.length
        ? `Reset clue information for ${letters.join(", ")}.`
        : "No eligible clue letters remained.";
    case "spy-add-point-1":
    case "spy-add-point-2":
      return `Inspector final guess total ${detail.points > 0 ? "+" : ""}${detail.points}.`;
    case "inspector-yellow-1":
      return detail?.letter
        ? `Yellow clue received: ${detail.letter}.`
        : "No unrevealed secret letter remained.";
    case "inspector-remove-unused-2":
      return letters.length
        ? `Ruled out letters: ${letters.join(", ")}.`
        : "No unused gray letters remained.";
    case "inspector-block-unused-4":
      return letters.length
        ? `Blocked letters: ${letters.join(", ")}.`
        : "No unused gray letters remained.";
    case "inspector-remove-point-1":
    case "inspector-remove-point-2":
      return `Inspector final guess total ${detail.points}.`;
    case "inspector-green-1":
      return detail?.letter && Number.isInteger(detail.index)
        ? `Green clue received: ${detail.letter} in position ${detail.index + 1}.`
        : "Every position was already known.";
    case "inspector-yellow-to-green-2": {
      const promoted = detail?.promoted || [];
      return promoted.length
        ? `Promoted to green: ${promoted
            .map(item => `${item.letter} in position ${item.index + 1}`)
            .join(", ")}.`
        : "No yellow clue could be promoted.";
    }
    default:
      if (option.kind === "power") return `${option.title} activated for this turn.`;
      return option.description || "Reward activated.";
  }
}

function emitEffect(io, roomId, payload) {
  if (io && roomId) io.to(roomId).emit("powerChoiceResolved", payload);
}

function applyChoice(state, option, choice, room, roomId, io) {
  if (!optionApplicable(state, option)) return false;
  let detail = null;

  if (option.kind === "power") {
    const action = {
      type: "USE_POWER",
      userId: choice.ownerUserId,
      powerId: option.powerId,
      source: "powerChoice"
    };
    const applied = engine.applyPower(
      option.powerId,
      state,
      action,
      roomId,
      io,
      room
    );
    if (applied === false) return false;
    state.powerUsedThisTurn = true;
    const side =
      choice.role === "setter"
        ? state.powerChoice.spy
        : state.powerChoice.inspector;
    if (!side.usedPowerIds.includes(option.powerId)) {
      side.usedPowerIds.push(option.powerId);
    }
    detail = { powerId: option.powerId };
  } else {
    switch (option.id) {
      case "spy-reset-positive-1":
        detail = { letters: resetRandom(state, 1, true) };
        break;
      case "spy-reset-known-2":
        detail = { letters: resetRandom(state, 2, false) };
        break;
      case "spy-add-point-1":
        state.guessCount = Math.max(0, Number(state.guessCount) || 0) + 1;
        detail = { points: 1 };
        break;
      case "spy-reset-positive-2":
        detail = { letters: resetRandom(state, 2, true) };
        break;
      case "spy-reset-vowels":
        detail = { letters: resetKnownVowels(state) };
        break;
      case "spy-add-point-2":
        state.guessCount = Math.max(0, Number(state.guessCount) || 0) + 2;
        detail = { points: 2 };
        break;
      case "inspector-yellow-1":
        detail = { letter: addYellow(state) };
        break;
      case "inspector-remove-unused-2":
        detail = { letters: ruleOutUnusedLetters(state, 3) };
        break;
      case "inspector-block-unused-4":
        detail = { letters: removeUnusedLetters(state, 4) };
        break;
      case "inspector-remove-point-1": {
        const before = Math.max(0, Number(state.guessCount) || 0);
        state.guessCount = Math.max(0, before - 1);
        detail = { points: state.guessCount - before };
        break;
      }
      case "inspector-green-1":
        detail = addGreen(state);
        break;
      case "inspector-yellow-to-green-2":
        detail = { promoted: promoteYellows(state, 2) };
        break;
      case "inspector-remove-point-2": {
        const before = Math.max(0, Number(state.guessCount) || 0);
        state.guessCount = Math.max(0, before - 2);
        detail = { points: state.guessCount - before };
        break;
      }
      default:
        return false;
    }
  }

  const resolution = {
    ownerUserId: choice.ownerUserId,
    role: choice.role,
    threshold: choice.threshold,
    optionId: option.id,
    icon: option.icon || "◆",
    title: option.title,
    description: option.description,
    detail,
    detailText: effectDetailText(option, detail),
    at: Date.now()
  };
  state.powerChoice.lastResolution = resolution;
  // Durable record so BOTH players' action logs can show which reward was
  // taken and what it did. The transient powerChoiceResolved emit only
  // drives the popup, and a power-backed reward's own power event says
  // nothing about the reward that granted it.
  state.powerChoice.resolutionLog ||= [];
  state.powerChoice.resolutionLog.push({
    role: resolution.role,
    title: resolution.title,
    detailText: resolution.detailText,
    at: resolution.at
  });
  emitEffect(io, roomId, resolution);
  return true;
}

function evaluateInspectorGuess(state, guess, roomId, io) {
  if (!isPowerChoice(state)) return;
  initializeRound(state);
  const inspector = state.powerChoice.inspector;
  const quest = inspector.currentQuest;

  // The quest is only actually attemptable on every other guess -- the
  // 2nd, 4th, 6th, etc. (inspector.attempts is the count BEFORE this
  // guess, so attempts===1 means this is the 2nd guess). On the guesses
  // in between, the client shows a "quest coming next round" placeholder
  // instead (see the matching questLive check in renderCurrentQuest(),
  // public/client/power-choice-mode.js) and this guess can't complete or
  // rotate it.
  const questLive = inspector.attempts % 2 === 1;
  const success = questLive && evaluateQuest(state, quest, guess);
  const conditions =
    questLive && quest?.type === "FIELDREPORT"
      ? evaluateFieldReportConditions(quest, guess)
      : [];
  inspector.attempts += 1;
  if (success) inspector.successes += 1;

  inspector.lastResult = {
    questId: quest?.id,
    title: quest?.title,
    description: quest?.description,
    success,
    conditions,
    guess: normalizeWord(guess),
    at: Date.now()
  };

  // A quest no longer builds toward a shared points meter -- meeting it
  // grants a reward immediately, cycling through the same three reward
  // tiers the old meter unlocked at 2/3/5 points (fixedOptions/
  // threePowerOptions below dispatch on these same threshold numbers, so
  // reusing them here keeps every existing reward card as-is).
  if (success) {
    inspector.questCompletions += 1;
    const tier = INSPECTOR_REWARD_SEQUENCE[
      (inspector.questCompletions - 1) % INSPECTOR_REWARD_SEQUENCE.length
    ];
    inspector.queuedMilestones.push(tier);
  }

  // A fresh quest replaces the current one after each live attempt at it
  // (win or lose) -- it's only ever attempted once every other guess, so
  // there's no reason to hold a missed one around for a second try.
  if (questLive) {
    inspector.currentQuest = makeQuest(quest?.type);
    inspector.questTurnsElapsed = 0;
  }

  if (io && roomId) {
    io.to(roomId).emit("powerChoiceQuestResult", inspector.lastResult);
  }
}

function passesAssassinRule(word, state) {
  const assassin = normalizeWord(state?.powers?.assassinWord);
  if (!assassin || assassin.length !== word.length) return true;
  let differences = 0;
  for (let index = 0; index < word.length; index++) {
    if (word[index] !== assassin[index]) differences += 1;
  }
  return differences >= 2;
}

function legalSecretCandidates(state, allowedSecrets) {
  const analysis = getCoverAnalysis(state, allowedSecrets);
  if (!analysis?.feasibleWords?.length) return { analysis, candidates: [] };
  const current = normalizeWord(state.secret);
  const pending = normalizeWord(state.pendingGuess);
  const candidates = analysis.feasibleWords
    .map(normalizeWord)
    .filter(
      word =>
        /^[A-Z]{5}$/.test(word) &&
        word !== current &&
        word !== pending &&
        passesAssassinRule(word, state)
    )
    .map(word => ({
      word,
      count: Number(getCandidateRemainingCount(analysis, word)) || 0
    }));
  return { analysis, candidates };
}

function chooseWorseSecret(state, allowedSecrets, fallbackSecret) {
  const { analysis, candidates } = legalSecretCandidates(state, allowedSecrets);
  if (!candidates.length) return normalizeWord(fallbackSecret) || null;
  const best = Number(analysis?.bestCount) || Math.max(...candidates.map(c => c.count));
  let worse = candidates.filter(candidate => candidate.count < best);
  if (!worse.length) worse = candidates;
  worse.sort((a, b) => a.count - b.count);
  const lowerBandSize = Math.max(1, Math.ceil(worse.length * 0.4));
  return pick(worse.slice(0, lowerBandSize))?.word || normalizeWord(fallbackSecret);
}

function chooseAISecretAction(state, allowedSecrets, fallbackSecret) {
  const fallback = normalizeWord(fallbackSecret);
  if (!isPowerChoice(state)) {
    const secret = spyChargeServer.chooseHintedBestSecret(
      state,
      allowedSecrets,
      fallback
    );
    return normalizeWord(secret) === normalizeWord(state.secret)
      ? { type: "SET_SECRET_SAME" }
      : { type: "SET_SECRET_NEW", secret };
  }

  const behavior = AI_BEHAVIOR[state.aiDifficulty] || AI_BEHAVIOR[1];
  const roll = Math.random();
  if (roll < behavior.spy.topHint) {
    const top = spyChargeServer.chooseHintedBestSecret(
      state,
      allowedSecrets,
      fallback
    );
    const secret = normalizeWord(top);
    if (secret && secret !== normalizeWord(state.secret)) {
      return { type: "SET_SECRET_NEW", secret };
    }
    return { type: "SET_SECRET_SAME" };
  }
  if (roll < behavior.spy.topHint + behavior.spy.keep) {
    return { type: "SET_SECRET_SAME" };
  }
  const worse = chooseWorseSecret(state, allowedSecrets, fallback);
  if (!worse || worse === normalizeWord(state.secret)) {
    return { type: "SET_SECRET_SAME" };
  }
  return { type: "SET_SECRET_NEW", secret: worse };
}

function chooseAIGuess(state, wordRows, allowedSecrets, fallbackGuess) {
  const fallback = normalizeWord(fallbackGuess);
  if (!isPowerChoice(state)) return fallbackGuess;
  initializeRound(state);
  const quest = state.powerChoice.inspector.currentQuest;
  if (!quest || evaluateQuest(state, quest, fallback)) return fallbackGuess;
  const behavior = AI_BEHAVIOR[state.aiDifficulty] || AI_BEHAVIOR[1];
  if (Math.random() >= behavior.inspector.chaseQuest) return fallbackGuess;

  const used = new Set(
    (state.history || []).map(entry => normalizeWord(entry?.guess)).filter(Boolean)
  );
  const eliminated = new Set(state.powerChoice.eliminatedLetters || []);
  const banned = normalizeWord(state.powers?.letterLockoutBanned).slice(0, 1);
  const rows = [...(wordRows || []), ...(allowedSecrets || [])];
  const deduped = [];
  const seen = new Set();
  for (const row of rows) {
    const word = wordOf(row);
    if (
      !/^[A-Z]{5}$/.test(word) ||
      seen.has(word) ||
      used.has(word) ||
      (banned && word.includes(banned)) ||
      [...eliminated].some(letter => word.includes(letter))
    ) {
      continue;
    }
    seen.add(word);
    deduped.push({ word, probability: Number(row?.probability) || 1 });
  }

  // Only chase a quest with a word still plausible from the Inspector's
  // visible information. If no such word exists, the normal AI guess is
  // better and is kept; this prevents blindly sacrificing every turn.
  const feasible = deduped.filter(row => {
    try {
      return isConsistentWithHistory(state.history || [], row.word, state, {
        fbGuesser: true
      });
    } catch {
      return false;
    }
  });
  const qualifying = feasible.filter(row => evaluateQuest(state, quest, row.word));
  if (!qualifying.length) return fallbackGuess;
  return weightedPick(qualifying, row => row.probability) ?.word || fallbackGuess;
}

// Hook the engine without registering a fake power. The old implementation
// registered "powerChoiceMode" as if it were a real power, so the engine's
// unconditional activity logger announced that it had been used at game
// start/guess submission. Wrapping the lifecycle methods preserves all real
// powers while keeping Power Choice out of the power log entirely.
if (!engine.__powerChoiceLifecycleV2) {
  engine.__powerChoiceLifecycleV2 = true;
  delete engine.powers.powerChoiceMode;
  const originalOnGuessSubmitted = engine.onGuessSubmitted;
  engine.onGuessSubmitted = function powerChoiceOnGuessSubmitted(
    state,
    guess,
    roomId,
    io
  ) {
    const result = originalOnGuessSubmitted.call(this, state, guess, roomId, io);
    evaluateInspectorGuess(state, guess, roomId, io);
    return result;
  };
  const originalTurnStart = engine.turnStart;
  engine.turnStart = function powerChoiceTurnStart(state, role, roomId, io) {
    const result = originalTurnStart.call(this, state, role, roomId, io);
    maybeOpenChoice(state);
    return result;
  };
}

// Make Power Choice replace the ordinary random/draft loadout while leaving
// tutorials, Daily Challenge and Dev Mode untouched.
if (!CompetitiveMode.prototype.__powerChoicePatchedV2) {
  CompetitiveMode.prototype.__powerChoicePatchedV2 = true;
  const originalLobbyReady = CompetitiveMode.prototype.onLobbyReady;
  CompetitiveMode.prototype.onLobbyReady = function patchedLobbyReady(
    state,
    setterPowers,
    guesserPowers,
    guesserQuest
  ) {
    if (!isPowerChoice(state)) {
      return originalLobbyReady.call(
        this,
        state,
        setterPowers,
        guesserPowers,
        guesserQuest
      );
    }
    originalLobbyReady.call(this, state, [], [], null);
    initializeRound(state);
  };
  const originalNextRound = CompetitiveMode.prototype.onNextRound;
  CompetitiveMode.prototype.onNextRound = function patchedNextRound(state) {
    const result = originalNextRound.call(this, state);
    if (isPowerChoice(state)) {
      state.activePowers = [];
      state.initialPowers = { setter: [], guesser: [] };
      state.powerChoice = null;
    }
    return result;
  };
}

// Preserve cover-strength star quality and the bonus target, but guarantee
// the mode's floor: one star for every eligible Keep/New decision, including
// keeping the same secret; two stars on the forced all-wrong opening.
if (!spyChargeServer.__powerChoicePatchedV2) {
  spyChargeServer.__powerChoicePatchedV2 = true;
  const originalInitialize = spyChargeServer.initializeForRound;
  const originalEvaluate = spyChargeServer.evaluateSecretChange;
  const originalCommit = spyChargeServer.commitAward;
  const originalIsLocked = spyChargeServer.isPowerLocked;
  const originalResetCount = spyChargeServer.getAvailableResetCount;

  spyChargeServer.initializeForRound = function patchedInitialize(
    state,
    setterPowerIds
  ) {
    if (!isPowerChoice(state)) return originalInitialize(state, setterPowerIds);
    initializeRound(state);
  };

  spyChargeServer.evaluateSecretChange = function patchedEvaluate(
    state,
    newSecret,
    allowedSecrets
  ) {
    const award = originalEvaluate(state, newSecret, allowedSecrets);
    if (!isPowerChoice(state) || !state?.powers?.spyCharge?.enabled) return award;
    if (state.simultaneousAllWrong) {
      return {
        ...award,
        baseStars: Math.max(2, Number(award?.baseStars) || 0),
        earnedStars: Math.max(2, Number(award?.earnedStars) || 0)
      };
    }
    const eligible =
      state.phase === "normal" &&
      state.turn === state.setter &&
      /^[A-Z]{5}$/.test(normalizeWord(state.pendingGuess)) &&
      /^[A-Z]{5}$/.test(normalizeWord(newSecret)) &&
      normalizeWord(newSecret) !== normalizeWord(state.pendingGuess) &&
      !state.powers?.stealthGuessActive &&
      !state.powers?.freezeActive &&
      !state.powers?.rouletteSecretActive &&
      !state.powers?.doubleGuessPending;
    if (!eligible) return award;
    const bonus = Math.max(0, Number(award?.bonusStars) || 0);
    const base = Math.max(1, Number(award?.baseStars) || 0);
    return {
      ...award,
      baseStars: base,
      bonusStars: bonus,
      earnedStars: base + bonus
    };
  };

  spyChargeServer.commitAward = function patchedCommit(state, award, room, io) {
    if (!isPowerChoice(state)) return originalCommit(state, award, room, io);
    initializeRound(state);
    const charge = state.powers.spyCharge;
    const before = Math.max(
      0,
      Math.min(15, Number(charge.total) || Number(award?.before) || 0)
    );
    const baseStars = Math.max(0, Number(award?.baseStars) || 0);
    const bonusStars = Math.max(0, Number(award?.bonusStars) || 0);
    const appliedStars = Math.min(15 - before, baseStars + bonusStars);
    const appliedBaseStars = Math.min(appliedStars, baseStars);
    const appliedBonusStars = Math.max(0, appliedStars - appliedBaseStars);
    const after = before + appliedStars;
    charge.total = after;
    charge.hint = null;
    queueCrossed(
      before,
      after,
      SPY_THRESHOLDS,
      state.powerChoice.spy.queuedMilestones,
      state.powerChoice.spy.claimedMilestones
    );
    const payload = {
      before,
      after,
      baseStars,
      bonusStars,
      appliedBaseStars,
      appliedBonusStars,
      appliedStars,
      unlockedPowerId: null,
      resetMilestones: []
    };
    const socketId = room?.playersByUserId?.[state.setter]?.socketId;
    if (socketId && io) io.to(socketId).emit("spyChargeAward", payload);
    return payload;
  };

  spyChargeServer.isPowerLocked = function patchedIsLocked(state, powerId) {
    return isPowerChoice(state) ? false : originalIsLocked(state, powerId);
  };

  spyChargeServer.getAvailableResetCount = function patchedResetCount(state) {
    return isPowerChoice(state) ? 0 : originalResetCount(state);
  };
}

function sendError(room, state, userId, io, message) {
  const socketId = room?.playersByUserId?.[userId]?.socketId;
  if (socketId && io) io.to(socketId).emit("errorMessage", message);
}

function handleAction(room, state, action, roomId, context) {
  if (!state || !action) return false;
  const io = context?.io;

  if (action.type === "SET_DRAFT_MODE") {
    if (state.hostUserId !== action.userId) return true;
    state.draftMode = !!action.draftMode;
    state.customPowersMode = false;
    state.gameMode = state.draftMode ? "draft" : "random";
    emitRoomState(roomId, room, io);
    return true;
  }

  if (action.type === "SET_POWER_MODE") {
    if (state.hostUserId !== action.userId) return true;
    if (![MODE, "draft", "random", "custom"].includes(action.mode)) return true;
    state.gameMode = action.mode;
    state.draftMode = action.mode === "draft";
    state.customPowersMode = action.mode === "custom";
    if (action.mode === MODE) state.powerChoice = null;
    emitRoomState(roomId, room, io);
    return true;
  }

  if (!isPowerChoice(state)) return false;
  initializeRound(state);
  const pending = state.powerChoice.pendingChoice;

  if (action.type === "POWER_CHOICE_SELECT") {
    if (
      !pending ||
      pending.ownerUserId !== action.userId ||
      pending.id !== action.choiceId
    ) {
      sendError(
        room,
        state,
        action.userId,
        io,
        "That reward choice is no longer available."
      );
      return true;
    }
    const option = pending.options.find(item => item.id === action.optionId);
    if (!option) {
      sendError(room, state, action.userId, io, "Choose one of the three cards.");
      return true;
    }
    if (!optionApplicable(state, option)) {
      sendError(
        room,
        state,
        action.userId,
        io,
        "That reward no longer has a valid target. Choose another card."
      );
      return true;
    }
    if (!applyChoice(state, option, pending, room, roomId, io)) {
      sendError(room, state, action.userId, io, "That reward could not be activated.");
      return true;
    }
    state.powerChoice.pendingChoice = null;
    emitRoomState(roomId, room, io);
    return true;
  }

  if (
    pending &&
    pending.ownerUserId === action.userId &&
    [
      "SUBMIT_GUESS",
      "SET_SECRET",
      "SET_SECRET_KEEP",
      "SET_SECRET_NEW",
      "SET_SECRET_SAME",
      "USE_POWER"
    ].includes(action.type)
  ) {
    sendError(
      room,
      state,
      action.userId,
      io,
      "Choose a reward card before continuing your turn."
    );
    return true;
  }

  if (action.type === "SUBMIT_GUESS" && action.userId === state.guesser) {
    const word = normalizeWord(action.guess);
    const blocked = blockedLetterIn(state, word);
    if (blocked) {
      sendError(
        room,
        state,
        action.userId,
        io,
        `${blocked} was ruled out and cannot be used.`
      );
      return true;
    }
  }

  // The same locked-out letters bind the Spy's secret too -- otherwise the
  // Spy could simply hide the word behind letters the Inspector is barred
  // from ever typing, which turns the reward into a self-inflicted trap.
  if (
    action.userId === state.setter &&
    ["SET_SECRET", "SET_SECRET_NEW"].includes(action.type)
  ) {
    const secret = normalizeWord(action.secret ?? action.word ?? action.guess);
    const blocked = secret && blockedLetterIn(state, secret);
    if (blocked) {
      sendError(
        room,
        state,
        action.userId,
        io,
        `${blocked} is locked out this round and cannot be used in the secret.`
      );
      return true;
    }
  }
  return false;
}

module.exports = {
  MODE,
  AI_BEHAVIOR,
  isPowerChoice,
  initializeRound,
  handleAction,
  evaluateQuest,
  evaluateFieldReportConditions,
  makeQuest,
  buildAIChoiceAction,
  chooseAISecretAction,
  chooseAIGuess,
  optionApplicable
};
