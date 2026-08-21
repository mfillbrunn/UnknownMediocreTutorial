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
const { applyDoubleGuess } = require("../core/phases/normal");
const {
  getCoverAnalysis,
  getCandidateRemainingCount
} = require("../utils/coverStrength");
const { tierFor } = require("./powerTiers");

const MODE = "powerChoice";
const SPY_THRESHOLDS = [5, 9, 15];
// Quests no longer build toward a shared points meter -- each quest met
// grants a reward immediately (one reward per completion, drawn from the
// same shared pool at all three -- see guesserRewardPool/buildChoice),
// cycling through these same three thresholds unchanged from when they
// were meter milestones.
const INSPECTOR_REWARD_SEQUENCE = [2, 3, 5];
// The Inspector gets exactly this many quests per round -- one per entry in
// the reward sequence above. Once the third has been attempted the quest
// system is finished for the round: no new quest is issued and the card
// disappears, rather than cycling a fourth quest back around to the first
// reward tier.
const INSPECTOR_MAX_QUESTS = INSPECTOR_REWARD_SEQUENCE.length;
const VOWELS = new Set("AEIOU");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Powers with no one-shot apply() at all -- their effect is entirely
// "always on" for as long as they're in activePowers (revealLocation/
// letterProfile's own turnStart hooks, letterLockout's per-turn button --
// see each one's own server module). A Power Choice reward that grants
// one of these isn't a single action to fire, it's a permanent unlock:
// see grantPersistentPower and state.powers.powerChoicePersistentGrants.
//
// letterProbe/betMiss/doubleGuess used to live here too (granted as a
// standing unlock, fired later through the player's own choice of
// moment), but they're immediate-fire cards now like every other power
// in the pool: the reward pick itself carries the real payload -- 5
// letters, a bet number, or a second word -- typed in on the spot, with
// no way to bank the power for later. See applyChoice's payload param.
const PERSISTENT_POWER_IDS = new Set([
  "revealLocation",
  "letterProfile",
  "letterLockout"
]);
const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const QUEST_TYPES = [
  "ROW_LIMIT",
  "ROW_ONLY",
  "ROW_AVOID",
  "RARE",
  "ALPHA",
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
  confuseColors: ["🎨", "Blue Mode", "Turn all feedback tiles blue for this turn, hiding which matches are green or yellow."],
  countOnly: ["🔢", "Count Only", "Show only how many letters match, without revealing their colors or positions."],
  fakeFeedback: ["🎭", "Fake Feedback", "Distort the feedback from the next resolved guess."],
  blindGuess: ["🙈", "Blind Guess", "Hide the Inspector's draft while they make this guess."],
  forceTimer: ["⏱", "Force Timer", "Put immediate time pressure on the Inspector's turn."],
  delayedIntel: ["📡", "Delayed Feedback", "Hold back the Inspector's feedback until after their following guess."],
  vowelRefresh: ["🔁", "Vowel Refresh", "Erase every clue on the vowels in the Inspector's last guess."],
  revealGreen: ["👁️", "Peek Letter", "Reveal one correct letter in its exact position."],
  freezeSecret: ["❄️", "Freeze Secret", "Prevent the Spy from changing the secret after this guess."],
  rouletteSecret: ["🎰", "Roulette Secret", "Force the Spy onto a legal random secret."],
  stealthGuess: ["🥷", "Stealth Guess", "Hide this guess during the Spy's Keep/New decision."],
  nonsense: ["🌀", "Silly Word", "Let the Inspector submit any five letters this turn, even when they do not form a real word."],
  magicMode: ["✨", "Magic Mode", "Activate the Inspector's special feedback mode this turn."],
  suggestGuess: ["💡", "Guess Tip", "Immediately suggests a random guess that still fits everything learned so far."],
  revealHistory: ["⏪", "Time Rewind", "Reveal the exact secret from three rounds ago."],
  // Immediate, payload-carrying cards: picking one prompts for its input
  // (5 letters / a bet number / two words) right then, and fires on the
  // spot -- there's no unlock to bank for later, see applyChoice's
  // payload param.
  letterProbe: ["🔎", "Recon Sweep", "Test 5 letters right now and learn how many are in the secret."],
  betMiss: ["🎯", "Miss Bet", "Bet right now how many misses your next guess will have -- guess right and win a free green letter."],
  doubleGuess: ["🔫", "Double Tap", "Submit two guesses at once right now and get feedback on both."],
  // PERSISTENT_POWER_IDS -- permanent unlocks, not one-turn effects, so
  // the copy says "from now on" instead of "this turn".
  revealLocation: ["🕵️", "Informant", "From now on, peek at one still-unknown position in the secret each of your turns."],
  letterProfile: ["🔤", "Letter Profile", "From now on, see how many vowels and consonants are in the secret, each of your turns."],
  letterLockout: ["🚫", "Letter Lockout", "From now on, ban one new letter from the Inspector's next guess on each of your turns."]
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
    // The Star and Quest Tutorials are the two tutorial stages that run
    // the real spy-charge/quest/reward-choice system live (see
    // client/tutorial-star.js, client/tutorial-quest.js, and
    // tutorialMode.js's onLobbyReady star/quest branches) instead of a
    // purely scripted/narrated walkthrough -- every other stage stays
    // excluded so it keeps its own scripted secrets/guesses undisturbed by
    // Power Choice's reward milestones and turn-flow changes.
    (!state.isTutorial || state.tutorialStage === "star" || state.tutorialStage === "quest") &&
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
      questsResolved: 0,
      attempts: 0,
      successes: 0,
      lastResult: null,
      // Whether the most recent LIVE quest attempt (the 2nd/4th/6th guess)
      // was met -- unlike lastResult, only ever written on a live guess, so
      // it survives the "waiting" guess right after it. lastResult itself
      // gets overwritten by every guess (live or not) with that guess's own
      // evaluation, which is meaningless on a non-live turn, so it can't be
      // used to tell the placeholder card which message to show.
      lastLiveSuccess: null
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
    questsResolved: 0,
    attempts: 0,
    successes: 0,
    lastResult: null,
    lastLiveSuccess: null
  };
  pc.inspector.questsResolved ||= 0;
  // Plain ||= would hand out a fourth quest the moment the third one was
  // cleared, since a null currentQuest is exactly what "finished" looks
  // like -- this runs on every action, not just at round start.
  if (pc.inspector.questsResolved < INSPECTOR_MAX_QUESTS) {
    pc.inspector.currentQuest ||= makeQuest();
  }
  pc.eliminatedLetters ||= [];
  pc.ruledOutLetters ||= [];
  pc.bonusTimeTurnKeys ||= [];

  // Most reward powers are applied immediately when selected and are
  // never added to the normal loadout, so neither a human nor the generic
  // AI can save or fire the same reward again on a later turn -- hence
  // rebuilding activePowers fresh (not preserving whatever it held before
  // this call) on every action. The exception is PERSISTENT_POWER_IDS:
  // Informant/Letter Profile/Letter Lockout are "always on" unlocks, not
  // one-shot actions, and their whole effect lives behind
  // `state.activePowers.includes(id)` (their own turnStart/button-gating
  // checks it directly) -- rebuilding from
  // state.powers.powerChoicePersistentGrants (survives round transitions,
  // see nextRoundTransition.js) instead of wiping to [] every time is
  // what makes "for the rest of the game" actually true instead of a
  // grant that a plain reset would silently undo on the very next action.
  const persistentGrants =
    state.powers.powerChoicePersistentGrants || { setter: [], guesser: [] };
  const spyPersistentPowers = [...(persistentGrants.setter || [])];
  const inspectorPersistentPowers = [...(persistentGrants.guesser || [])];
  state.activePowers = [...spyPersistentPowers, ...inspectorPersistentPowers];
  state.initialPowers = { setter: spyPersistentPowers, guesser: inspectorPersistentPowers };
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

// The Spy's own reward pool -- unlike the Inspector, the Spy sees the
// SAME pool at every one of their three milestones (5/9/15 stars)
// instead of a different fixed catalog per tier plus a separate
// "3 random powers" middle stage. Built once as a plain list (mixing
// "fixed" effect cards and one "power" card) rather than per-threshold,
// since there's no longer a threshold-dependent branch to take -- see
// buildChoice, which now calls this directly for every Spy threshold.
function setterRewardPool() {
  return [
    {
      id: "spy-reset-positive-1",
      kind: "fixed",
      icon: "🟩⇢🟨",
      title: "Fade a Green",
      description: "Turn one green tile into yellow.",
      explanation: "The letter stays known to be present, but its exact position is no longer locked."
    },
    {
      id: "spy-reset-known-2",
      kind: "fixed",
      icon: "⬛↶2",
      title: "Erase Two Clues",
      description: "Reset two random gray letters.",
      explanation: "Two absent-letter restrictions are erased, giving the Spy more legal secret words."
    },
    {
      id: "spy-add-point-1",
      kind: "fixed",
      icon: "+1",
      title: "Add a Point",
      description: "Add 1 point to the Inspector's final guess total.",
      explanation: "This does not change letter information; it directly worsens the Inspector's final score."
    },
    {
      id: "spy-yellow-smudge",
      kind: "fixed",
      icon: "🟨⇢⇢",
      title: "Yellow Smudge",
      description: "Remove every positional restriction from every yellow letter.",
      explanation: "Each yellow letter stays known to be present, but every 'not in this spot' mark on it is forgotten."
    },
    {
      id: "spy-trade-yellow",
      kind: "fixed",
      icon: "🟨⇄⬛4",
      title: "Trade a Yellow",
      description: "Give the Inspector one new yellow, but reset four of your gray letters.",
      explanation: "A calculated risk: one present-letter clue handed over, four absent-letter restrictions erased in return."
    },
    {
      id: "spy-trade-green",
      kind: "fixed",
      icon: "🟩⇄🟨🟨",
      title: "Trade a Green",
      description: "Give the Inspector one new green, but erase two yellow clues.",
      explanation: "A bigger risk for a bigger reward: one exact-position reveal in exchange for two present-letter clues forgotten."
    },
    powerOption("blindSpot"),
    powerOption("letterLockout"),
    // One-off effects, activated immediately on pick (not persistent
    // grants like letterLockout above) -- same non-PERSISTENT_POWER_IDS
    // branch of applyChoice that blindSpot already goes through.
    powerOption("confuseColors"),
    powerOption("countOnly"),
    powerOption("fakeFeedback"),
    powerOption("blindGuess"),
    powerOption("forceTimer"),
    powerOption("delayedIntel"),
    powerOption("vowelRefresh")
  ];
}

function fixedOptions(role, threshold) {
  if (role === "guesser" && threshold === 2) {
    return [
      {
        id: "inspector-yellow-1",
        kind: "fixed",
        tier: 1,
        icon: "🟨",
        title: "Yellow Intel",
        description: "Reveal one random letter that is in the secret.",
        explanation: "You learn a present letter, but not its correct position."
      },
      {
        id: "inspector-remove-unused-2",
        kind: "fixed",
        tier: 1,
        icon: "×2",
        title: "Rule Out Two",
        description: "Rule out and lock two unused letters that are not in the secret.",
        explanation: "Both letters are confirmed absent and cannot be used in later Inspector guesses."
      },
      {
        id: "inspector-remove-point-1",
        kind: "fixed",
        tier: 1,
        icon: "−1",
        title: "Remove a Point",
        description: "Subtract 1 point from your final guess total.",
        explanation: "This improves the Inspector's score without revealing any letter information."
      }
    ];
  }

  return [];
}

// The Inspector's own reward pool -- same shared-pool treatment as the
// Spy's setterRewardPool: ONE pool drawn from at all three quest
// milestones (2/3/5 completions) instead of a fixed tier-1 catalog, a
// separate "3 random powers" middle stage, and a fixed tier-3 catalog.
// Reuses the tier-1 fixed cards from fixedOptions(guesser, 2) as-is and
// lists every guesser power directly, same style as setterRewardPool,
// since Time Rewind needs tier-conditional inclusion a flat static list
// can't express.
//
// `tier` is the 1/2/3 buildChoice already computes from
// INSPECTOR_REWARD_SEQUENCE -- Time Rewind (revealHistory) only enters
// the pool from the 2nd quest reward onward, never the 1st, since a match
// that young essentially never has the 3 completed rounds its own
// apply() requires anyway (see the "revealHistory" case in
// powerOptionApplicable for the belt-and-suspenders runtime check).
function guesserRewardPool(tier) {
  const pool = [
    ...fixedOptions("guesser", 2),
    powerOption("revealGreen"),
    powerOption("freezeSecret"),
    powerOption("rouletteSecret"),
    powerOption("stealthGuess"),
    powerOption("nonsense"),
    powerOption("magicMode"),
    powerOption("revealLocation"),
    powerOption("letterProfile"),
    // One-off effects, activated immediately on pick. Recon Sweep/Miss
    // Bet/Double Tap each need a real payload (5 letters, a bet number,
    // two words) -- the reward card itself collects it and fires on the
    // spot, see applyChoice's payload param -- there's no way to bank
    // the power for later.
    powerOption("suggestGuess"),
    powerOption("letterProbe"),
    powerOption("betMiss"),
    powerOption("doubleGuess")
  ];
  if (tier >= 2) pool.push(powerOption("revealHistory"));
  return pool;
}

function buildChoice(state, role, threshold, owner) {
  // Both roles now draw from ONE shared pool at every one of their three
  // milestones (Spy: 5/9/15 stars, Inspector: 2/3/5 quest completions)
  // instead of a threshold-dependent catalog switch -- see setterRewardPool/
  // guesserRewardPool, which buildChoice calls directly for every
  // threshold instead of asking fixedOptions to dispatch per-threshold.
  if (role === "setter") {
    const tier = SPY_THRESHOLDS.indexOf(threshold) + 1;
    const options = rewardPickAvailableOptions(state, setterRewardPool(), 3);
    return {
      id: `setter-${threshold}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ownerUserId: owner,
      role,
      threshold,
      tier,
      title: `Spy reward · Tier ${tier}`,
      subtitle: "Choose one available reward. It activates immediately.",
      options
    };
  }

  const tier = INSPECTOR_REWARD_SEQUENCE.indexOf(threshold) + 1;
  const options = rewardPickAvailableOptions(state, guesserRewardPool(tier), 3);
  return {
    id: `${role}-${threshold}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    ownerUserId: owner,
    role,
    threshold,
    tier,
    title: `Inspector reward · Tier ${tier}`,
    subtitle: "Choose one available reward. It activates immediately.",
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
  if (!isPowerChoice(state) || state.gameOver || state.phase !== "normal") return;
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
  const choice = buildChoice(state, role, threshold, state.turn);
  if (!choice.options.length) {
    side.queuedMilestones.unshift(threshold);
    return;
  }
  if (!side.claimedMilestones.includes(threshold)) {
    side.claimedMilestones.push(threshold);
  }
  pc.pendingChoice = choice;
  addChoiceTime(state, state.turn, choice.id);
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

function unusedLetterCandidates(state) {
  const secretLetters = new Set(normalizeWord(state.secret));
  const used = new Set(
    (state.history || []).flatMap(entry => normalizeWord(entry?.guess).split(""))
  );
  const unavailable = new Set([
    ...(state.powerChoice?.eliminatedLetters || []),
    ...(state.powerChoice?.ruledOutLetters || [])
  ]);
  for (const constraint of state.extraConstraints || []) {
    if (String(constraint?.type || "").toUpperCase() === "ABSENT" && constraint?.letter) {
      unavailable.add(normalizeWord(constraint.letter)[0]);
    }
  }
  return ALPHABET.filter(
    letter =>
      !secretLetters.has(letter) &&
      !used.has(letter) &&
      !unavailable.has(letter)
  );
}

// Registers each letter as a hard "cannot be in the secret" constraint --
// the same GREEN/YELLOW machinery isConsistentWithHistory already enforces
// (see game-engine/history.js both client and server copies), so a secret
// containing one is rejected up front by the setter's own draft validation
// (computeSetterSecretStatus -> validateSetterSecretWord) instead of only
// being caught after the fact by blockedLetterIn's SET_SECRET check --
// which fixes the setter's ack still coming back {ok:true} on a rejected
// SET_SECRET_NEW (see socketHandlers.js) making the draft look accepted.
// It also makes legalSecretCandidates/chooseWorseSecret treat the letter
// as unavailable, so the AI setter stops proposing secrets that contain it.
function addAbsentConstraints(state, letters) {
  state.extraConstraints ||= [];
  const existing = new Set(
    state.extraConstraints
      .filter(c => c.type === "ABSENT")
      .map(c => c.letter)
  );
  for (const letter of letters) {
    if (existing.has(letter)) continue;
    state.extraConstraints.push({ type: "ABSENT", letter });
    existing.add(letter);
  }
}

// Unlocks a PERSISTENT_POWER_IDS power for `role`, for the rest of the
// game -- not just applied once, and not undone by initializeRound's
// normal per-action activePowers rebuild (which now reads this same
// field back out, see initializeRound above). Idempotent: choosing the
// same persistent reward twice (fixedOptionApplicable/powerOptionApplicable
// should already prevent the card from being offered again, but this
// stays safe either way) doesn't duplicate the grant.
function grantPersistentPower(state, role, powerId) {
  state.powers.powerChoicePersistentGrants ||= { setter: [], guesser: [] };
  const key = role === "setter" ? "setter" : "guesser";
  const list = (state.powers.powerChoicePersistentGrants[key] ||= []);
  if (!list.includes(powerId)) list.push(powerId);
  if (!state.activePowers.includes(powerId)) {
    state.activePowers = [...state.activePowers, powerId];
  }
}

// Actually blocks the letters from being typed (see the SUBMIT_GUESS
// check and markEliminatedKeys() client-side).
function removeUnusedLetters(state, count) {
  const selected = shuffle(unusedLetterCandidates(state)).slice(0, count);
  state.powerChoice ||= {};
  const eliminated = new Set(state.powerChoice.eliminatedLetters || []);
  for (const letter of selected) eliminated.add(letter);
  state.powerChoice.eliminatedLetters = [...eliminated];
  rewardAddAbsentConstraints(state, selected);
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

// POWER CHOICE REWARD TIERS V1: HELPERS START
function rewardMarkKind(mark) {
  const value = String(mark || "").trim().toLowerCase();
  if (value.includes("🟩") || value === "green" || value === "g") return "green";
  if (value.includes("🟨") || value === "yellow" || value === "y") return "yellow";
  if (
    value.includes("⬛") ||
    value.includes("⬜") ||
    ["gray", "grey", "black", "b", "x"].includes(value)
  ) {
    return "gray";
  }
  return null;
}

function rewardVisibleFeedback(entry) {
  return Array.isArray(entry?.fbGuesser) ? entry.fbGuesser : entry?.fb;
}

function rewardClueTargets(state, kind) {
  const targets = [];
  const seen = new Set();
  for (let entryIndex = 0; entryIndex < (state.history || []).length; entryIndex++) {
    const entry = state.history[entryIndex];
    const word = normalizeWord(entry?.guess);
    const feedback = rewardVisibleFeedback(entry);
    if (!Array.isArray(feedback)) continue;
    for (let index = 0; index < Math.min(5, feedback.length); index++) {
      if (rewardMarkKind(feedback[index]) !== kind || !word[index]) continue;
      const key = `history:${entryIndex}:${index}:${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ source: "history", entryIndex, index, letter: word[index], kind });
    }
  }
  for (const constraint of state.extraConstraints || []) {
    const type = String(constraint?.type || "").toUpperCase();
    if (type !== kind.toUpperCase() || !constraint?.letter) continue;
    const letter = normalizeWord(constraint.letter)[0];
    const index = Number.isInteger(constraint.index) ? constraint.index : null;
    const key = `constraint:${type}:${letter}:${index == null ? "-" : index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ source: "constraint", constraint, index, letter, kind });
  }
  return targets;
}

function rewardColoredTargets(state) {
  return [...rewardClueTargets(state, "green"), ...rewardClueTargets(state, "yellow")];
}

function rewardEraseClueTarget(state, target) {
  if (!target) return null;
  if (target.source === "history") {
    const entry = state.history?.[target.entryIndex];
    if (!entry) return null;
    for (const field of ["fb", "fbGuesser"]) {
      if (Array.isArray(entry[field]) && entry[field][target.index]) {
        entry[field][target.index] = "";
      }
    }
  } else if (target.source === "constraint") {
    state.extraConstraints = (state.extraConstraints || []).filter(
      constraint => constraint !== target.constraint
    );
  } else {
    return null;
  }
  return {
    letter: target.letter,
    index: Number.isInteger(target.index) ? target.index : null,
    kind: target.kind
  };
}

function rewardEraseClues(state, kind, count) {
  const selected = shuffle(rewardClueTargets(state, kind)).slice(0, count);
  return selected.map(target => rewardEraseClueTarget(state, target)).filter(Boolean);
}

function rewardDemoteGreens(state, count) {
  const selected = shuffle(rewardClueTargets(state, "green")).slice(0, count);
  const demoted = [];
  for (const target of selected) {
    if (target.source === "history") {
      const entry = state.history?.[target.entryIndex];
      if (!entry) continue;
      for (const field of ["fb", "fbGuesser"]) {
        if (Array.isArray(entry[field]) && entry[field][target.index]) {
          entry[field][target.index] = "🟨";
        }
      }
    } else if (target.source === "constraint") {
      state.extraConstraints = (state.extraConstraints || []).filter(
        constraint => constraint !== target.constraint
      );
      rewardEnsureYellowConstraint(state, target.letter);
      if (Number.isInteger(target.index)) {
        state.extraConstraints ||= [];
        if (
          !state.extraConstraints.some(
            constraint =>
              String(constraint?.type || "").toUpperCase() === "YELLOW_NOT_AT" &&
              normalizeWord(constraint?.letter)[0] === target.letter &&
              constraint.index === target.index
          )
        ) {
          state.extraConstraints.push({
            type: "YELLOW_NOT_AT",
            letter: target.letter,
            index: target.index
          });
        }
      }
    } else {
      continue;
    }
    demoted.push({
      letter: target.letter,
      index: Number.isInteger(target.index) ? target.index : null
    });
  }
  return demoted;
}

function rewardGrayLetters(state) {
  const positives = new Set(
    rewardColoredTargets(state).map(target => target.letter).filter(Boolean)
  );
  for (const constraint of state.extraConstraints || []) {
    if (
      String(constraint?.type || "").toUpperCase() === "LETTER_COUNT" &&
      Number(constraint?.count) > 0 &&
      constraint?.letter
    ) {
      positives.add(normalizeWord(constraint.letter)[0]);
    }
  }
  const gray = new Set();
  for (const entry of state.history || []) {
    const word = normalizeWord(entry?.guess);
    const feedback = rewardVisibleFeedback(entry);
    if (!Array.isArray(feedback)) continue;
    for (let index = 0; index < Math.min(5, feedback.length); index++) {
      if (rewardMarkKind(feedback[index]) === "gray" && word[index]) gray.add(word[index]);
    }
  }
  for (const constraint of state.extraConstraints || []) {
    if (String(constraint?.type || "").toUpperCase() === "ABSENT" && constraint?.letter) {
      gray.add(normalizeWord(constraint.letter)[0]);
    }
  }
  for (const letter of state.powerChoice?.eliminatedLetters || []) gray.add(normalizeWord(letter)[0]);
  for (const letter of state.powerChoice?.ruledOutLetters || []) gray.add(normalizeWord(letter)[0]);
  return [...gray].filter(letter => letter && !positives.has(letter));
}

function rewardResetGrayLetters(state, count, excludedLetters = []) {
  const excluded = new Set(
    (excludedLetters || []).map(value => normalizeWord(value)[0]).filter(Boolean)
  );
  const selected = shuffle(
    rewardGrayLetters(state).filter(letter => !excluded.has(letter))
  ).slice(0, count);
  if (selected.length) eraseLetterKnowledge(state, selected);
  return selected;
}

function rewardEnsureYellowConstraint(state, letter) {
  const normalized = normalizeWord(letter)[0];
  if (!normalized) return;
  state.extraConstraints ||= [];
  if (
    !state.extraConstraints.some(
      constraint =>
        String(constraint?.type || "").toUpperCase() === "YELLOW" &&
        normalizeWord(constraint?.letter)[0] === normalized
    )
  ) {
    state.extraConstraints.push({ type: "YELLOW", letter: normalized });
  }
}

// "Yellow Smudge" (spy-yellow-smudge): every currently-known yellow
// letter stays known to be present, but every "not in this spot" mark on
// it -- both the raw history tile (each surviving yellow tile in
// state.history IS itself a "not here" data point, see
// isConsistentWithHistory) and any explicit YELLOW_NOT_AT constraint
// (added by rewardDemoteGreens when a constraint-sourced green gets
// demoted to yellow, see there) -- is forgotten. rewardEraseClues/
// rewardLoosenYellow only ever touched ONE yellow at a time and never
// looked at YELLOW_NOT_AT at all; this covers every known yellow letter
// and both storage forms in one pass.
function rewardLoosenAllYellows(state) {
  const letters = rewardKnownYellowLetters(state);
  const historyTargets = rewardClueTargets(state, "yellow").filter(
    target => target.source === "history"
  );
  for (const letter of letters) {
    for (const target of historyTargets) {
      if (target.letter === letter) rewardEraseClueTarget(state, target);
    }
    state.extraConstraints = (state.extraConstraints || []).filter(
      constraint =>
        !(
          String(constraint?.type || "").toUpperCase() === "YELLOW_NOT_AT" &&
          normalizeWord(constraint.letter)[0] === letter
        )
    );
    rewardEnsureYellowConstraint(state, letter);
  }
  return letters;
}

function rewardUnknownSecretLetters(state) {
  const known = new Set(rewardColoredTargets(state).map(target => target.letter));
  for (const constraint of state.extraConstraints || []) {
    const type = String(constraint?.type || "").toUpperCase();
    if (["GREEN", "YELLOW", "LETTER_COUNT"].includes(type) && constraint?.letter) {
      known.add(normalizeWord(constraint.letter)[0]);
    }
  }
  return [...new Set(normalizeWord(state.secret).split(""))].filter(
    letter => letter && !known.has(letter)
  );
}

function rewardAddYellows(state, count) {
  const added = [];
  for (let index = 0; index < count; index++) {
    const letter = addYellow(state);
    if (!letter || added.includes(letter)) break;
    added.push(letter);
  }
  return added;
}

function rewardAddAbsentConstraints(state, letters) {
  state.extraConstraints ||= [];
  for (const value of letters || []) {
    const letter = normalizeWord(value)[0];
    if (!letter) continue;
    if (
      !state.extraConstraints.some(
        constraint =>
          String(constraint?.type || "").toUpperCase() === "ABSENT" &&
          normalizeWord(constraint?.letter)[0] === letter
      )
    ) {
      state.extraConstraints.push({ type: "ABSENT", letter });
    }
  }
}

function rewardRuleOutAbsent(state, count) {
  const selected = shuffle(unusedLetterCandidates(state)).slice(0, count);
  state.powerChoice ||= {};
  const ruledOut = new Set(state.powerChoice.ruledOutLetters || []);
  for (const letter of selected) ruledOut.add(letter);
  state.powerChoice.ruledOutLetters = [...ruledOut];
  rewardAddAbsentConstraints(state, selected);
  return selected;
}

function rewardKnownYellowLetters(state) {
  const letters = new Set(rewardClueTargets(state, "yellow").map(target => target.letter));
  for (const constraint of state.extraConstraints || []) {
    if (
      ["YELLOW", "YELLOW_NOT_AT"].includes(String(constraint?.type || "").toUpperCase()) &&
      constraint?.letter
    ) {
      letters.add(normalizeWord(constraint.letter)[0]);
    }
  }
  return [...letters].filter(Boolean);
}

function rewardFixedOptionApplicable(state, option) {
  const id = option?.id;
  const greenCount = rewardClueTargets(state, "green").length;
  const yellowCount = rewardClueTargets(state, "yellow").length;
  const grayCount = rewardGrayLetters(state).length;
  const unusedCount = unusedLetterCandidates(state).length;
  const unknownPresentCount = rewardUnknownSecretLetters(state).length;
  switch (id) {
    case "spy-reset-positive-1":
      return greenCount >= 1;
    case "spy-reset-known-2":
      return grayCount >= 2;
    case "spy-add-point-1":
      return true;
    case "spy-yellow-smudge":
      return yellowCount >= 1;
    case "spy-trade-yellow":
      return unknownPresentCount >= 1;
    case "spy-trade-green":
      return knownGreenIndexes(state).size < 5;
    case "inspector-yellow-1":
      return unknownPresentCount >= 1;
    case "inspector-remove-unused-2":
      return unusedCount >= 2;
    case "inspector-remove-point-1":
      return (Number(state.guessCount) || 0) >= 1;
    default:
      return false;
  }
}

function rewardOptionApplicable(state, option) {
  if (option?.kind === "power") {
    if (typeof powerOptionApplicable === "function") {
      return powerOptionApplicable(state, option);
    }
    if (!engine.powers?.[option.powerId]?.apply) return false;
    switch (option.powerId) {
      case "revealGreen":
        return knownGreenIndexes(state).size < 5;
      case "freezeSecret":
      case "rouletteSecret":
        return !state.simultaneousAllWrong;
      default:
        return true;
    }
  }
  return rewardFixedOptionApplicable(state, option);
}

// Options that would do nothing right now (rewardOptionApplicable ===
// false, e.g. no green tile left to fade, no yellow tile left to smudge)
// are preferred, but never at the cost of showing fewer than `limit`
// cards -- if a whole pool narrows to 1-2 applicable options (easy to hit
// now that more of the fixed rewards are gated on real board state), the
// remaining slots are padded from the rest of the pool instead of just
// leaving the player with a two- or one-card draft.
function rewardPickAvailableOptions(state, options, limit = 3) {
  const list = Array.isArray(options) ? options : [];
  if (list.length <= limit) return shuffle(list);
  const usable = list.filter(option => rewardOptionApplicable(state, option));
  const rest = list.filter(option => !usable.includes(option));
  return shuffle(usable).concat(shuffle(rest)).slice(0, limit);
}

function rewardWeightedPick(items, weightFor) {
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

function rewardPickAIOption(options) {
  return rewardWeightedPick(options, option => {
    if (option?.kind === "power") return 1;
    return /point|score/i.test(`${option?.id || ""} ${option?.title || ""}`) ? 0.20 : 0.40;
  });
}
// POWER CHOICE REWARD TIERS V1: HELPERS END

function powerOptionApplicable(state, option) {
  if (!option || option.kind !== "power") return false;
  // Persistent-grant powers (see PERSISTENT_POWER_IDS) are exempt from
  // this check regardless of whether they have a real apply() -- some
  // (revealLocation/letterProfile) genuinely don't, letterLockout does
  // but needs a payload this reward system can't supply at pick time, so
  // the card being applicable is about the GRANT, not about calling
  // apply() directly. doubleGuess is also exempt for a different reason:
  // it isn't reachable through engine.applyPower at all -- its real logic
  // lives in normal.js's applyDoubleGuess (see applyChoice), not a
  // registered power, so this generic "has apply()" probe would always
  // read as missing for it. Every other power-kind card still needs a
  // real apply() to do anything when chosen.
  if (
    !PERSISTENT_POWER_IDS.has(option.powerId) &&
    option.powerId !== "doubleGuess" &&
    !engine.powers?.[option.powerId]?.apply
  ) {
    return false;
  }
  switch (option.powerId) {
    case "revealGreen":
      return knownGreenIndexes(state).size < 5;
    case "freezeSecret":
    case "rouletteSecret":
      return !state.simultaneousAllWrong;
    case "stealthGuess":
      return !state.powers?.stealthGuessUsed;
    case "nonsense":
      return !state.powers?.nonsenseUsed;
    case "magicMode":
      // Magic Mode affects feedback from the upcoming guess, so it remains
      // useful even when no yellow was known before this turn.
      return true;
    case "revealLocation":
    case "letterProfile":
      // Already unlocked -- offering the same permanent grant again would
      // just waste a reward slot on a no-op.
      return !(state.powers?.powerChoicePersistentGrants?.guesser || []).includes(option.powerId);
    case "letterLockout":
      return !(state.powers?.powerChoicePersistentGrants?.setter || []).includes(option.powerId);
    // Immediate-fire, payload-carrying cards -- mirrors each power's own
    // POWER_RULES.js/applyDoubleGuess precondition (minus the redundant
    // turn===guesser check, since a reward choice only ever opens on the
    // owner's own turn), so a card that would fail on pick isn't offered.
    case "letterProbe":
      return !state.powers?.letterProbeUsed;
    case "betMiss":
      return !state.powers?.betMissUsed;
    case "doubleGuess":
      return !state.powers?.doubleGuessUsed && !state.pendingGuess;
    case "blindSpot":
      // One-shot for the whole round (state.powers.blindSpotUsed) -- once
      // used, offering the card again would just fail silently when
      // picked (blindSpotServer.js's apply() itself returns false/no-ops
      // on a second use).
      return !state.powers?.blindSpotUsed;
    // One-off effects below, all one-shot per round (their own Used flag
    // resets fresh with the rest of state.powers each round -- see
    // stateFactory.js) -- same "don't offer a card that would silently
    // fail" reasoning as blindSpot above. Mirrors each power's own
    // POWER_RULES.js allowed() gate, minus the redundant turn===setter
    // check (a Spy reward choice only ever opens on the Spy's own turn).
    case "confuseColors":
      return !state.powers?.confuseColorsUsed;
    case "countOnly":
      return !state.powers?.countOnlyUsed;
    case "fakeFeedback":
      return !state.powers?.fakeFeedbackUsed;
    case "blindGuess":
      return !state.powers?.blindGuessUsed;
    case "forceTimer":
      return !state.powers?.forceTimerUsed && (state.history || []).length >= 1;
    case "delayedIntel":
      return !state.powers?.delayedIntelUsed && !!state.pendingGuess;
    case "vowelRefresh":
      // apply() itself no-ops when the last guess had no vowel to refresh
      // (see vowelRefreshServer.js) -- checked here too so that case
      // doesn't get offered as a card either.
      return (
        !state.powers?.vowelRefreshUsed &&
        /[AEIOU]/.test(String(state.history?.[state.history.length - 1]?.guess || "").toUpperCase())
      );
    // Same one-off treatment for the Inspector's own immediate powers.
    case "suggestGuess":
      return (state.powers?.suggestGuessUses || 0) < 2;
    case "revealHistory":
      // guesserRewardPool only ever includes this card from the 2nd quest
      // reward onward, but a match can still be young enough at that
      // point that fewer than 3 rounds have happened yet -- checked here
      // too so that case doesn't get offered as a guaranteed-fail card.
      return !state.powers?.revealHistoryUsed && (state.history || []).length >= 3;
    default:
      return true;
  }
}

function fixedOptionApplicable(state, option) {
  return rewardFixedOptionApplicable(state, option);
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
  const clueText = items =>
    (items || [])
      .filter(Boolean)
      .map(item =>
        item.letter && Number.isInteger(item.index)
          ? `${item.letter} in position ${item.index + 1}`
          : item.letter || String(item)
      )
      .join(", ");

  switch (option.id) {
    case "spy-reset-known-2":
      return letters.length
        ? `Reset gray letters: ${letters.join(", ")}.`
        : "No eligible gray letters remained.";
    case "spy-add-point-1":
      return `Inspector final guess total +${detail?.points || 0}.`;
    case "spy-yellow-smudge":
      return detail?.letters?.length
        ? `Removed position restrictions from: ${detail.letters.join(", ")}.`
        : "No yellow letters remained.";
    case "spy-reset-positive-1":
      return detail?.demoted?.length
        ? `Blurred green position: ${clueText(detail.demoted)} is now yellow.`
        : "No eligible green tile remained.";
    case "spy-trade-yellow":
      return detail?.yellow
        ? `Gave the Inspector ${detail.yellow} as a yellow clue; reset gray letters: ${detail.grays?.join(", ") || "none available"}.`
        : "No unrevealed secret letter remained -- nothing to trade.";
    case "spy-trade-green":
      return detail?.green
        ? `Gave the Inspector ${detail.green.letter} at position ${detail.green.index + 1} as a green clue; erased yellow clue${detail.erasedYellows?.length === 1 ? "" : "s"}: ${clueText(detail.erasedYellows) || "none available"}.`
        : "No unrevealed position remained -- nothing to trade.";
    case "inspector-yellow-1":
      return detail?.letter
        ? `Yellow clue received: ${detail.letter}.`
        : "No unrevealed secret letter remained.";
    case "inspector-remove-unused-2":
      return letters.length
        ? `Locked absent letters: ${letters.join(", ")}.`
        : "No eligible absent letters remained.";
    case "inspector-remove-point-1":
      return `Inspector final guess total ${detail?.points || 0}.`;
    default:
      if (option.kind === "power") {
        // PERSISTENT_POWER_IDS grants (Informant/Letter Profile/Letter
        // Lockout) are permanent unlocks, not a one-turn effect -- saying
        // "for this turn" here would flatly contradict the "from now on"
        // wording POWER_COPY already gives these same three in the card
        // itself.
        return PERSISTENT_POWER_IDS.has(option.powerId)
          ? `${option.title} unlocked for the rest of the game.`
          : `${option.title} activated for this turn.`;
      }
      return option.description || "Reward activated.";
  }
}

function emitEffect(io, roomId, payload) {
  if (io && roomId) io.to(roomId).emit("powerChoiceResolved", payload);
}

// Rewards that erase letter knowledge change which secrets are still
// feasible, which is exactly what the Spy's bonus-star hint and the
// best/keep counts behind the star rating are computed from. Those are
// rolled once at the start of the Spy's turn (rollHintForTurn, called from
// normalTransitions.js) and a reward lands mid-turn, so without this the
// Spy kept being shown a target letter/position derived from the board as
// it was BEFORE their own reward wiped part of it -- pointing at a word
// that was no longer the best switch, and sometimes no longer legal.
// Every setter fixed-reward card that erases or alters letter knowledge
// (extraConstraints, history feedback, gray/absent letters) rather than
// just moving points around or fogging the next-quest preview -- all of
// these change which secrets are still legal, so all of them need the
// Spy's hint/star-rating re-rolled against the post-reward board.
const KNOWLEDGE_RESET_OPTIONS = new Set([
  "spy-reset-positive-1",
  "spy-reset-known-2",
  "spy-yellow-smudge",
  "spy-trade-yellow",
  "spy-trade-green",
  // Power-kind cards use "power:<id>" as their option id (see
  // powerOption()) -- vowelRefresh is the only one of the setter's
  // one-off power picks that erases existing letter knowledge
  // (eraseLetterKnowledge on the last guess's vowels) rather than just
  // affecting an upcoming guess's feedback delivery.
  "power:vowelRefresh"
]);

function rerollSpyHintAfterReset(state, option, context) {
  if (!KNOWLEDGE_RESET_OPTIONS.has(option?.id)) return;
  const allowedSecrets = context?.ALLOWED_SECRETS;
  if (!allowedSecrets) return;
  // rollHintForTurn clears the hint before deciding whether it can produce
  // a new one, so calling it outside the Spy's own decision step would
  // wipe a perfectly good hint and put nothing back. A reward is always
  // taken on the owner's turn, so this simply confirms that.
  if (state.phase !== "normal" || state.turn !== state.setter) return;
  // Recomputed from the post-reset board, so the readout above the draft
  // row and the star rating agree with what the Spy can now actually do.
  // coverStrength.js keys its own caches on the history feedback plus
  // extraConstraints, both of which eraseLetterKnowledge just mutated, so
  // the analysis behind this re-roll is already rebuilt rather than stale.
  spyChargeServer.rollHintForTurn(state, allowedSecrets);
}

// `payload` carries whatever extra input the player typed alongside their
// card pick -- letters for Recon Sweep, a number for Miss Bet, two words
// for Double Tap -- straight from the incoming POWER_CHOICE_SELECT
// action (see handleAction below). Every other reward ignores it.
function applyChoice(state, option, choice, room, roomId, io, context, payload) {
  if (!rewardOptionApplicable(state, option)) return false;
  let detail = null;

  if (option.kind === "power") {
    if (PERSISTENT_POWER_IDS.has(option.powerId)) {
      // Calling engine.applyPower with the bare fabricated action below
      // would either silently no-op (revealLocation/letterProfile, pure
      // turnStart hooks with nothing to fire once) or fail outright
      // (letterLockout needs a letter action.letter this card never
      // supplies). The reward IS the unlock itself: from now on the role
      // simply has access to a power that was already fully built and
      // already worked when a human/classic draft granted it the normal
      // way -- there's no second activation step to perform here.
      grantPersistentPower(state, choice.role, option.powerId);
      state.powerUsedThisTurn = true;
      const side =
        choice.role === "setter"
          ? state.powerChoice.spy
          : state.powerChoice.inspector;
      if (!side.usedPowerIds.includes(option.powerId)) side.usedPowerIds.push(option.powerId);
      detail = { powerId: option.powerId, persistent: true };
    } else if (option.powerId === "doubleGuess") {
      // Not reachable through engine.applyPower at all -- Double Tap's
      // real logic lives in normal.js's own USE_DOUBLE_GUESS handling
      // (immediate-win check, handing a hidden guess off to the setter,
      // and so on), extracted there as applyDoubleGuess so both the
      // per-turn path and this one call the exact same code. Its own
      // internal gate checks activePowers up front, so that has to be
      // set before calling it rather than after like every other card.
      state.activePowers ||= [];
      if (!state.activePowers.includes("doubleGuess")) state.activePowers.push("doubleGuess");
      const fired = applyDoubleGuess(
        state,
        { type: "USE_DOUBLE_GUESS", userId: choice.ownerUserId, guess1: payload?.guess1, guess2: payload?.guess2 },
        roomId,
        io,
        room,
        context
      );
      if (!fired) return false;
      const side =
        choice.role === "setter"
          ? state.powerChoice.spy
          : state.powerChoice.inspector;
      if (!side.usedPowerIds.includes("doubleGuess")) side.usedPowerIds.push("doubleGuess");
      state.powerChoice.temporaryPowerIds ||= [];
      if (!state.powerChoice.temporaryPowerIds.includes("doubleGuess")) {
        state.powerChoice.temporaryPowerIds.push("doubleGuess");
      }
      detail = { powerId: "doubleGuess" };
    } else {
      const action = {
        ...(payload && typeof payload === "object" ? payload : {}),
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
      if (!side.usedPowerIds.includes(option.powerId)) side.usedPowerIds.push(option.powerId);
      state.powerChoice.temporaryPowerIds ||= [];
      if (!state.powerChoice.temporaryPowerIds.includes(option.powerId)) {
        state.powerChoice.temporaryPowerIds.push(option.powerId);
      }
      state.activePowers ||= [];
      if (!state.activePowers.includes(option.powerId)) state.activePowers.push(option.powerId);
      detail = { powerId: option.powerId };
    }
  } else {
    switch (option.id) {
      case "spy-reset-positive-1":
        detail = { demoted: rewardDemoteGreens(state, 1) };
        break;
      case "spy-reset-known-2":
        detail = { letters: rewardResetGrayLetters(state, 2) };
        break;
      case "spy-add-point-1":
        state.guessCount = Math.max(0, Number(state.guessCount) || 0) + 1;
        detail = { points: 1 };
        break;
      case "spy-yellow-smudge":
        detail = { letters: rewardLoosenAllYellows(state) };
        break;
      case "spy-trade-yellow":
        detail = {
          yellow: addYellow(state),
          grays: rewardResetGrayLetters(state, 4)
        };
        break;
      case "spy-trade-green":
        detail = {
          green: addGreen(state),
          erasedYellows: rewardEraseClues(state, "yellow", 2)
        };
        break;
      case "inspector-yellow-1":
        detail = { letter: addYellow(state) };
        break;
      case "inspector-remove-unused-2":
        detail = { letters: removeUnusedLetters(state, 2) };
        break;
      case "inspector-remove-point-1": {
        const before = Math.max(0, Number(state.guessCount) || 0);
        state.guessCount = Math.max(0, before - 1);
        detail = { points: state.guessCount - before };
        break;
      }
      default:
        return false;
    }
  }

  rerollSpyHintAfterReset(state, option, context);

  const resolution = {
    ownerUserId: choice.ownerUserId,
    role: choice.role,
    threshold: choice.threshold,
    tier: option.tier || choice.tier || null,
    optionId: option.id,
    icon: option.icon || "◆",
    title: option.title,
    description: option.description,
    explanation: option.explanation || "",
    detail,
    detailText: effectDetailText(option, detail),
    at: Date.now()
  };
  state.powerChoice.lastResolution = resolution;
  // Durable record so BOTH players' action logs can show which reward was
  // taken and what it did, in the correct chronological turn order (see
  // action-log.js's buildLog) -- the transient powerChoiceResolved emit
  // only drives the popup, and a power-backed reward's own power event
  // says nothing about the reward card that granted it.
  state.powerChoice.resolutionLog ||= [];
  state.powerChoice.resolutionLog.push({
    role: resolution.role,
    title: resolution.title,
    detailText: resolution.detailText,
    at: resolution.at,
    guessNumber: Array.isArray(state.history) ? state.history.length : 0
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
  // ...and only while there is still a quest to attempt at all: the run
  // ends after INSPECTOR_MAX_QUESTS, at which point currentQuest is null
  // for the rest of the round and every guess is just a guess.
  const questLive = !!quest && inspector.attempts % 2 === 1;
  const success = questLive && evaluateQuest(state, quest, guess);
  const conditions =
    questLive && quest?.type === "FIELDREPORT"
      ? evaluateFieldReportConditions(quest, guess)
      : [];
  inspector.attempts += 1;
  if (success) inspector.successes += 1;
  // Only written on the live guess itself -- lastResult below is
  // overwritten by every guess, including the very next (non-live) one,
  // which would otherwise erase the real result before the "waiting" turn
  // ever gets a chance to show it (see renderCurrentQuest()).
  if (questLive) inspector.lastLiveSuccess = success;

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
  // grants a reward immediately, cycling through the same three
  // thresholds the old meter unlocked at 2/3/5 points, each now opening
  // one pick from the Inspector's own shared pool (guesserRewardPool).
  if (success) {
    inspector.questCompletions += 1;
    const tier = INSPECTOR_REWARD_SEQUENCE[
      Math.min(
        inspector.questCompletions - 1,
        INSPECTOR_REWARD_SEQUENCE.length - 1
      )
    ];
    inspector.queuedMilestones.push(tier);
  }

  // A fresh quest replaces the current one after each live attempt at it
  // (win or lose) -- it's only ever attempted once every other guess, so
  // there's no reason to hold a missed one around for a second try. After
  // the third attempt the run is over: currentQuest is cleared and stays
  // cleared (see initializeRound's matching questsResolved guard), so the
  // quest card disappears instead of dealing a fourth.
  if (questLive) {
    inspector.questsResolved = (Number(inspector.questsResolved) || 0) + 1;
    inspector.currentQuest =
      inspector.questsResolved >= INSPECTOR_MAX_QUESTS
        ? null
        : makeQuest(quest?.type);
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
    // The Spy's third and final milestone (15 stars) grants two reward
    // picks in a row instead of one -- queue the same threshold a second
    // time so maybeOpenChoice naturally opens a second choice-of-3 the
    // instant the first one resolves. queueCrossed's own dedup only
    // exists to stop the SAME crossing from being queued twice on repeat
    // calls; it doesn't guard against this deliberate second push.
    if (before < 15 && after >= 15) {
      state.powerChoice.spy.queuedMilestones.push(15);
      state.powerChoice.spy.queuedMilestones.sort((a, b) => a - b);
    }
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
    // Payload for the handful of cards that need real input typed in on
    // the spot (letters/betMissNumber/guess1+guess2) -- see applyChoice.
    if (!applyChoice(state, option, pending, room, roomId, io, context, action)) {
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
  SPY_THRESHOLDS,
  INSPECTOR_REWARD_SEQUENCE,
  isPowerChoice,
  initializeRound,
  handleAction,
  evaluateQuest,
  evaluateFieldReportConditions,
  makeQuest,
  buildAIChoiceAction,
  chooseAISecretAction,
  chooseAIGuess,
  optionApplicable,
  // Exported for server/core/simulation/runRewardSimulation.js -- lets it
  // enumerate and directly apply one specific reward option (bypassing the
  // normal star/quest-threshold queueing) to isolate that one reward's
  // effect on a trial.
  applyChoice,
  fixedOptions,
  powerOption,
  setterRewardPool,
  guesserRewardPool
};
