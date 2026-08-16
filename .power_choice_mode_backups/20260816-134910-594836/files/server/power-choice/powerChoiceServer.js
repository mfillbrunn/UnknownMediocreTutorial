"use strict";

const engine = require("../powers/powerEngineServer");
const CompetitiveMode = require("../core/modes/competitiveMode");
const spyChargeServer = require("../powers/powers/spyChargeServer");
const POWER_METADATA = require("../powers/powerMetadata");
const { eraseLetterKnowledge } = require("../utils/resetLetterKnowledge");
const { satisfiesForceGuess } = require("../game-engine/validation");
const { generateConditions } = require("../powers/powers/fieldReportServer");
const { emitRoomState } = require("../core/rooms");
const { randomPool, tierFor } = require("./powerTiers");

const MODE = "powerChoice";
const SPY_THRESHOLDS = [5, 8, 15];
const INSPECTOR_THRESHOLDS = [2, 3, 5];
const VOWELS = new Set("AEIOU");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const QUEST_TYPES = [
  "ROW", "RARE", "ALPHA", "DOUBLES", "HARDMODE", "FIELDREPORT",
  "ALTERNATING", "BOOKENDS", "HALF_AM", "HALF_NZ", "VOWELSHORTAGE"
];

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
function pick(array) {
  return array?.length ? array[Math.floor(Math.random() * array.length)] : null;
}
function shuffle(array) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function isPowerChoice(state) {
  return !!(
    state && state.gameMode === MODE && !state.isTutorial &&
    !state.isDaily && !state.devMode
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
    version: 1,
    roundIndex: Number(roundIndex) || 0,
    spy: { queuedMilestones: [], claimedMilestones: [], usedPowerIds: [] },
    inspector: {
      points: 0,
      queuedMilestones: [],
      claimedMilestones: [],
      usedPowerIds: [],
      currentQuest: null,
      nextQuest: null,
      attempts: 0,
      successes: 0,
      lastResult: null
    },
    pendingChoice: null,
    temporaryPowerIds: [],
    eliminatedLetters: [],
    bonusTimeTurnKeys: [],
    lastResolution: null
  };
}

function ensureFieldReportConditions() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const conditions = generateConditions() || [];
    const kinds = new Set(conditions.map(c => c?.type));
    const repetitive = kinds.has("firstLastSame") && kinds.has("startsWith") && kinds.has("endsWith");
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
    case "startsWith": return `Start with ${condition.letter}`;
    case "endsWith": return `End with ${condition.letter}`;
    case "doubleLetter": return condition.letter ? `Use double ${condition.letter}` : "Use a doubled letter";
    case "minVowels": return `Use at least ${condition.count} vowels`;
    case "maxVowels": return `Use at most ${condition.count} vowels`;
    case "firstLastSame": return "Use the same first and last letter";
    case "palindrome": return "Make a palindrome";
    default: return "Match the condition";
  }
}
function makeQuest(excludeType = null) {
  const available = QUEST_TYPES.filter(type => type !== excludeType);
  const type = pick(available) || "ALPHA";
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (type === "ROW") {
    const row = pick(["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"]);
    return { id, type, icon: "⌨", title: "Keyboard Row", description: `Use only letters from ${row}.`, row };
  }
  if (type === "RARE") {
    const letters = shuffle("QJXZWKVFYBHGCMPD".split("")).slice(0, 5);
    return { id, type, icon: "💎", title: "Rare Letter", description: `Use at least one of: ${letters.join(" · ")}.`, letters };
  }
  if (type === "ALPHA") return { id, type, icon: "↗", title: "In Order", description: "Letters must be strictly alphabetical, forward or backward." };
  if (type === "DOUBLES") return { id, type, icon: "Ⅱ", title: "Double Trouble", description: "Use the same letter twice in a row." };
  if (type === "HARDMODE") return { id, type, icon: "🧠", title: "Hard Mode", description: "Honor every green and yellow clue already known." };
  if (type === "FIELDREPORT") {
    const conditions = ensureFieldReportConditions();
    return {
      id, type, icon: "📋", title: "Field Report",
      description: "Satisfy all three listed conditions in one guess.",
      conditions,
      conditionLabels: conditions.map(conditionText)
    };
  }
  if (type === "ALTERNATING") return { id, type, icon: "〰", title: "Alternating", description: "Alternate vowels and consonants across all five letters." };
  if (type === "BOOKENDS") return { id, type, icon: "◉", title: "Bookends", description: "Use the same first and last letter." };
  if (type === "HALF_AM") return { id, type, icon: "A–M", title: "First Half", description: "Use only letters A through M." };
  if (type === "HALF_NZ") return { id, type, icon: "N–Z", title: "Second Half", description: "Use only letters N through Z." };
  const vowelTarget = pick([1, 2, 3]);
  return { id, type, icon: "◌", title: "Vowel Count", description: `Use exactly ${vowelTarget} vowel${vowelTarget === 1 ? "" : "s"}.`, vowelTarget };
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
      if (mark.includes("🟩") || mark === "green" || mark === "g") greenByIndex.set(i, guess[i]);
      if (mark.includes("🟨") || mark === "yellow" || mark === "y") yellowLetters.add(guess[i]);
    }
  }
  for (const c of state.extraConstraints || []) {
    if (String(c?.type).toUpperCase() === "GREEN" && Number.isInteger(c.index)) greenByIndex.set(c.index, normalizeWord(c.letter)[0]);
    if (String(c?.type).toUpperCase() === "YELLOW" && c.letter) yellowLetters.add(normalizeWord(c.letter)[0]);
  }
  return { greenByIndex, yellowLetters };
}
function hardModeCompliant(state, word) {
  const { greenByIndex, yellowLetters } = knownClues(state);
  for (const [index, letter] of greenByIndex) if (word[index] !== letter) return false;
  for (const letter of yellowLetters) if (letter && !word.includes(letter)) return false;
  return true;
}
function evaluateQuest(state, quest, guess) {
  const word = normalizeWord(guess);
  if (!/^[A-Z]{5}$/.test(word) || !quest) return false;
  switch (quest.type) {
    case "ROW": return [...word].every(letter => quest.row.includes(letter));
    case "RARE": return quest.letters.some(letter => word.includes(letter));
    case "ALPHA": {
      const codes = [...word].map(c => c.charCodeAt(0));
      return codes.every((v, i) => i === 0 || v > codes[i - 1]) || codes.every((v, i) => i === 0 || v < codes[i - 1]);
    }
    case "DOUBLES": return /(.)\1/.test(word);
    case "HARDMODE": return hardModeCompliant(state, word);
    case "FIELDREPORT": return (quest.conditions || []).length === 3 && quest.conditions.every(c => satisfiesForceGuess(word, c));
    case "ALTERNATING": return [...word].every((letter, i) => i === 0 || VOWELS.has(letter) !== VOWELS.has(word[i - 1]));
    case "BOOKENDS": return word[0] === word[4];
    case "HALF_AM": return [...word].every(letter => letter >= "A" && letter <= "M");
    case "HALF_NZ": return [...word].every(letter => letter >= "N" && letter <= "Z");
    case "VOWELSHORTAGE": return [...word].filter(letter => VOWELS.has(letter)).length === quest.vowelTarget;
    default: return false;
  }
}
function initializeRound(state) {
  if (!isPowerChoice(state) || !state.powers) return;
  const roundIndex = Number(state.roundIndex) || 0;
  const freshRound = !state.powerChoice || state.powerChoice.roundIndex !== roundIndex;
  if (freshRound) state.powerChoice = freshPowerChoice(roundIndex);
  const pc = state.powerChoice;
  pc.enabled = true;
  pc.inspector.currentQuest ||= makeQuest();
  pc.inspector.nextQuest ||= makeQuest(pc.inspector.currentQuest.type);
  state.activePowers = [...(pc.temporaryPowerIds || [])];
  state.initialPowers = { setter: [], guesser: [] };
  state.customPlayerPowers = null;
  if (freshRound || !state.powers.spyCharge?.enabled) state.powers.spyCharge = freshSpyCharge();
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
    if (before < threshold && after >= threshold && !claimed.includes(threshold) && !queue.includes(threshold)) queue.push(threshold);
  }
  queue.sort((a, b) => a - b);
}
function powerOption(powerId) {
  const fallback = POWER_METADATA[powerId]?.label || powerId;
  const [icon, title, description] = POWER_COPY[powerId] || ["⚡", fallback, "Activate this power for the current turn."];
  return { id: `power:${powerId}`, kind: "power", powerId, icon, title, description, tier: tierFor(powerId) };
}
function threePowerOptions(role, usedPowerIds) {
  const safe = role === "setter"
    ? ["confuseColors", "countOnly", "fakeFeedback", "blindGuess", "forceTimer", "delayedIntel"]
    : ["revealGreen", "freezeSecret", "rouletteSecret", "stealthGuess", "nonsense", "magicMode"];
  const tiered = randomPool(role).filter(id => safe.includes(id));
  let candidates = tiered.filter(id => !usedPowerIds.includes(id));
  if (candidates.length < 3) candidates = tiered;
  return shuffle(candidates).slice(0, 3).map(powerOption);
}
function fixedOptions(role, threshold) {
  if (role === "setter" && threshold === 5) return [
    { id: "spy-reset-positive-1", kind: "fixed", icon: "↶", title: "Erase One Clue", description: "Reset one random yellow or green letter." },
    { id: "spy-reset-known-2", kind: "fixed", icon: "🧹", title: "Erase Two Clues", description: "Reset two random known letters, including gray letters." },
    { id: "spy-add-point-1", kind: "fixed", icon: "+1", title: "Add a Point", description: "Add 1 point to the Inspector's final guess total." }
  ];
  if (role === "setter" && threshold === 15) return [
    { id: "spy-reset-positive-2", kind: "fixed", icon: "↶↶", title: "Erase Two Colors", description: "Reset two random yellow or green letters." },
    { id: "spy-reset-vowels", kind: "fixed", icon: "AEIOU", title: "Erase Vowels", description: "Reset all learned information about vowels." },
    { id: "spy-add-point-2", kind: "fixed", icon: "+2", title: "Add Two Points", description: "Add 2 points to the Inspector's final guess total." }
  ];
  if (role === "guesser" && threshold === 2) return [
    { id: "inspector-yellow-1", kind: "fixed", icon: "🟨", title: "Yellow Intel", description: "Reveal one random letter that is in the secret." },
    { id: "inspector-remove-unused-2", kind: "fixed", icon: "⌫⌫", title: "Rule Out Two", description: "Remove two random unused letters that are not in the secret." },
    { id: "inspector-remove-point-1", kind: "fixed", icon: "−1", title: "Remove a Point", description: "Subtract 1 point from your final guess total." }
  ];
  if (role === "guesser" && threshold === 5) return [
    { id: "inspector-green-1", kind: "fixed", icon: "🟩", title: "Green Intel", description: "Reveal one random letter in its exact position." },
    { id: "inspector-yellow-to-green-2", kind: "fixed", icon: "🟨→🟩", title: "Promote Clues", description: "Turn up to two known yellow letters into green positions." },
    { id: "inspector-remove-point-2", kind: "fixed", icon: "−2", title: "Remove Two Points", description: "Subtract 2 points from your final guess total." }
  ];
  return [];
}
function buildChoice(state, role, threshold, owner) {
  const side = role === "setter" ? state.powerChoice.spy : state.powerChoice.inspector;
  const randomMilestone = (role === "setter" && threshold === 8) || (role === "guesser" && threshold === 3);
  const options = randomMilestone ? threePowerOptions(role, side.usedPowerIds) : fixedOptions(role, threshold);
  return {
    id: `${role}-${threshold}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ownerUserId: owner,
    role,
    threshold,
    title: role === "setter" ? `Spy reward · ${threshold} stars` : `Inspector reward · ${threshold} quest points`,
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
  state.timeRemaining[owner] = Math.max(0, Number(state.timeRemaining[owner]) || 0) + 30;
  keys.push(key);
}
function maybeOpenChoice(state, io) {
  if (!isPowerChoice(state) || state.gameOver || state.phase !== "normal") return;
  initializeRound(state);
  const pc = state.powerChoice;
  if (pc.pendingChoice || !state.turn) return;
  const role = state.turn === state.setter ? "setter" : state.turn === state.guesser ? "guesser" : null;
  if (!role) return;
  const side = role === "setter" ? pc.spy : pc.inspector;
  const threshold = side.queuedMilestones.shift();
  if (!threshold) return;
  if (!side.claimedMilestones.includes(threshold)) side.claimedMilestones.push(threshold);
  pc.pendingChoice = buildChoice(state, role, threshold, state.turn);
  addChoiceTime(state, state.turn, pc.pendingChoice.id);
  if (state.players?.[state.turn]?.isAI && pc.pendingChoice.options.length) {
    applyChoice(state, pc.pendingChoice.options[0], pc.pendingChoice, null, null, io);
    pc.pendingChoice = null;
  }
}
function feedbackLetters(state, positiveOnly) {
  const letters = new Set();
  for (const entry of state.history || []) {
    const word = normalizeWord(entry?.guess);
    const fb = Array.isArray(entry?.fbGuesser) ? entry.fbGuesser : entry?.fb;
    if (!Array.isArray(fb)) continue;
    for (let i = 0; i < 5; i++) {
      const mark = String(fb[i] || "").toLowerCase();
      const positive = mark.includes("🟩") || mark.includes("🟨") || ["green", "yellow", "g", "y"].includes(mark);
      const known = !!mark && mark !== "?";
      if ((positiveOnly ? positive : known) && word[i]) letters.add(word[i]);
    }
  }
  for (const c of state.extraConstraints || []) {
    const type = String(c?.type || "").toUpperCase();
    if (c?.letter && (positiveOnly ? (type === "GREEN" || type === "YELLOW") : true)) letters.add(normalizeWord(c.letter)[0]);
  }
  return [...letters].filter(Boolean);
}
function resetRandom(state, count, positiveOnly) {
  const selected = shuffle(feedbackLetters(state, positiveOnly)).slice(0, count);
  if (selected.length) eraseLetterKnowledge(state, selected);
  return selected;
}
function addYellow(state) {
  const known = new Set(feedbackLetters(state, true));
  const candidates = [...new Set(normalizeWord(state.secret).split(""))].filter(letter => !known.has(letter));
  const letter = pick(candidates);
  if (!letter) return null;
  state.extraConstraints ||= [];
  if (!state.extraConstraints.some(c => String(c.type).toUpperCase() === "YELLOW" && normalizeWord(c.letter)[0] === letter)) {
    state.extraConstraints.push({ type: "YELLOW", letter });
  }
  return letter;
}
function knownGreenIndexes(state) {
  const set = new Set();
  const clues = knownClues(state);
  for (const index of clues.greenByIndex.keys()) set.add(index);
  return set;
}
function addGreen(state) {
  const secret = normalizeWord(state.secret);
  const known = knownGreenIndexes(state);
  const index = pick([0, 1, 2, 3, 4].filter(i => secret[i] && !known.has(i)));
  if (index == null) return null;
  state.extraConstraints ||= [];
  state.extraConstraints.push({ type: "GREEN", index, letter: secret[index] });
  return { index, letter: secret[index] };
}
function promoteYellows(state, count) {
  const secret = normalizeWord(state.secret);
  const { yellowLetters } = knownClues(state);
  const knownGreen = knownGreenIndexes(state);
  const promoted = [];
  for (const letter of shuffle([...yellowLetters])) {
    const index = [...secret].findIndex((c, i) => c === letter && !knownGreen.has(i));
    if (index < 0) continue;
    state.extraConstraints ||= [];
    state.extraConstraints = state.extraConstraints.filter(c => !(String(c.type).toUpperCase() === "YELLOW" && normalizeWord(c.letter)[0] === letter));
    state.extraConstraints.push({ type: "GREEN", index, letter });
    knownGreen.add(index);
    promoted.push({ index, letter });
    if (promoted.length >= count) break;
  }
  return promoted;
}
function removeUnusedLetters(state, count) {
  const secretLetters = new Set(normalizeWord(state.secret));
  const used = new Set((state.history || []).flatMap(entry => normalizeWord(entry?.guess).split("")));
  const eliminated = new Set(state.powerChoice.eliminatedLetters || []);
  const choices = ALPHABET.filter(letter => !secretLetters.has(letter) && !used.has(letter) && !eliminated.has(letter));
  const selected = shuffle(choices).slice(0, count);
  state.powerChoice.eliminatedLetters = [...eliminated, ...selected];
  return selected;
}
function emitEffect(io, roomId, payload) {
  if (io && roomId) io.to(roomId).emit("powerChoiceResolved", payload);
}
function applyChoice(state, option, choice, room, roomId, io) {
  let detail = null;
  if (option.kind === "power") {
    const action = { type: "USE_POWER", userId: choice.ownerUserId, powerId: option.powerId, source: "powerChoice" };
    engine.applyPower(option.powerId, state, action, roomId, io, room);
    const side = choice.role === "setter" ? state.powerChoice.spy : state.powerChoice.inspector;
    if (!side.usedPowerIds.includes(option.powerId)) side.usedPowerIds.push(option.powerId);
    state.powerChoice.temporaryPowerIds ||= [];
    if (!state.powerChoice.temporaryPowerIds.includes(option.powerId)) state.powerChoice.temporaryPowerIds.push(option.powerId);
    state.activePowers ||= [];
    if (!state.activePowers.includes(option.powerId)) state.activePowers.push(option.powerId);
    detail = { powerId: option.powerId };
  } else {
    switch (option.id) {
      case "spy-reset-positive-1": detail = { letters: resetRandom(state, 1, true) }; break;
      case "spy-reset-known-2": detail = { letters: resetRandom(state, 2, false) }; break;
      case "spy-add-point-1": state.guessCount = Math.max(0, Number(state.guessCount) || 0) + 1; detail = { points: 1 }; break;
      case "spy-reset-positive-2": detail = { letters: resetRandom(state, 2, true) }; break;
      case "spy-reset-vowels": eraseLetterKnowledge(state, [...VOWELS]); detail = { letters: [...VOWELS] }; break;
      case "spy-add-point-2": state.guessCount = Math.max(0, Number(state.guessCount) || 0) + 2; detail = { points: 2 }; break;
      case "inspector-yellow-1": detail = { letter: addYellow(state) }; break;
      case "inspector-remove-unused-2": detail = { letters: removeUnusedLetters(state, 2) }; break;
      case "inspector-remove-point-1": state.guessCount = Math.max(0, (Number(state.guessCount) || 0) - 1); detail = { points: -1 }; break;
      case "inspector-green-1": detail = addGreen(state); break;
      case "inspector-yellow-to-green-2": detail = { promoted: promoteYellows(state, 2) }; break;
      case "inspector-remove-point-2": state.guessCount = Math.max(0, (Number(state.guessCount) || 0) - 2); detail = { points: -2 }; break;
      default: return false;
    }
  }
  state.powerChoice.lastResolution = {
    ownerUserId: choice.ownerUserId,
    role: choice.role,
    threshold: choice.threshold,
    optionId: option.id,
    title: option.title,
    detail,
    at: Date.now()
  };
  emitEffect(io, roomId, state.powerChoice.lastResolution);
  return true;
}
function evaluateInspectorGuess(state, guess, roomId, io) {
  if (!isPowerChoice(state)) return;
  initializeRound(state);
  const inspector = state.powerChoice.inspector;
  const quest = inspector.currentQuest;
  const success = evaluateQuest(state, quest, guess);
  const before = inspector.points;
  inspector.attempts += 1;
  if (success) {
    inspector.points = Math.min(5, inspector.points + 1);
    inspector.successes += 1;
  }
  inspector.lastResult = { questId: quest?.id, title: quest?.title, success, guess: normalizeWord(guess), at: Date.now() };
  queueCrossed(before, inspector.points, INSPECTOR_THRESHOLDS, inspector.queuedMilestones, inspector.claimedMilestones);
  inspector.currentQuest = inspector.nextQuest || makeQuest();
  inspector.nextQuest = makeQuest(inspector.currentQuest.type);
  if (io && roomId) io.to(roomId).emit("powerChoiceQuestResult", inspector.lastResult);
}

// Fake power hook: always loaded, active only in Power Choice matches.
engine.registerPower("powerChoiceMode", {
  onGuessSubmitted(state, guess, roomId, io) {
    evaluateInspectorGuess(state, guess, roomId, io);
  },
  turnStart(state, _role, roomId, io) {
    maybeOpenChoice(state, io);
  }
});

// Make Power Choice replace the ordinary random/draft loadout while leaving
// tutorial, daily and dev matches untouched.
if (!CompetitiveMode.prototype.__powerChoicePatched) {
  CompetitiveMode.prototype.__powerChoicePatched = true;
  const originalLobbyReady = CompetitiveMode.prototype.onLobbyReady;
  CompetitiveMode.prototype.onLobbyReady = function patchedLobbyReady(state, setterPowers, guesserPowers, guesserQuest) {
    if (!isPowerChoice(state)) return originalLobbyReady.call(this, state, setterPowers, guesserPowers, guesserQuest);
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

// Preserve the existing star-quality calculation, but guarantee the requested
// minimum: 1 star per eligible Keep/New decision, or 2 for all-wrong opening.
if (!spyChargeServer.__powerChoicePatched) {
  spyChargeServer.__powerChoicePatched = true;
  const originalInitialize = spyChargeServer.initializeForRound;
  const originalEvaluate = spyChargeServer.evaluateSecretChange;
  const originalCommit = spyChargeServer.commitAward;
  const originalIsLocked = spyChargeServer.isPowerLocked;
  const originalResetCount = spyChargeServer.getAvailableResetCount;

  spyChargeServer.initializeForRound = function patchedInitialize(state, setterPowerIds) {
    if (!isPowerChoice(state)) return originalInitialize(state, setterPowerIds);
    initializeRound(state);
  };
  spyChargeServer.evaluateSecretChange = function patchedEvaluate(state, newSecret, allowedSecrets) {
    const award = originalEvaluate(state, newSecret, allowedSecrets);
    if (!isPowerChoice(state) || !state?.powers?.spyCharge?.enabled) return award;
    if (state.simultaneousAllWrong) return { ...award, baseStars: Math.max(2, Number(award.baseStars) || 0), earnedStars: Math.max(2, Number(award.earnedStars) || 0) };
    const eligible = state.phase === "normal" && state.turn === state.setter && /^[A-Z]{5}$/.test(normalizeWord(state.pendingGuess)) && /^[A-Z]{5}$/.test(normalizeWord(newSecret)) && normalizeWord(newSecret) !== normalizeWord(state.pendingGuess) && !state.powers?.stealthGuessActive && !state.powers?.freezeActive && !state.powers?.rouletteSecretActive && !state.powers?.doubleGuessPending;
    if (!eligible) return award;
    const bonus = Number(award?.bonusStars) || ((state.powers.spyCharge.hint && normalizeWord(newSecret)[state.powers.spyCharge.hint.position] === state.powers.spyCharge.hint.letter) ? 1 : 0);
    const base = Math.max(1, Number(award?.baseStars) || 0);
    return { ...award, baseStars: base, bonusStars: bonus, earnedStars: base + bonus };
  };
  spyChargeServer.commitAward = function patchedCommit(state, award, room, io) {
    if (!isPowerChoice(state)) return originalCommit(state, award, room, io);
    initializeRound(state);
    const charge = state.powers.spyCharge;
    const before = Math.max(0, Math.min(15, Number(charge.total) || Number(award?.before) || 0));
    const baseStars = Math.max(0, Number(award?.baseStars) || 0);
    const bonusStars = Math.max(0, Number(award?.bonusStars) || 0);
    const appliedStars = Math.min(15 - before, baseStars + bonusStars);
    const after = before + appliedStars;
    charge.total = after;
    charge.hint = null;
    queueCrossed(before, after, SPY_THRESHOLDS, state.powerChoice.spy.queuedMilestones, state.powerChoice.spy.claimedMilestones);
    const payload = { before, after, baseStars, bonusStars, appliedBaseStars: Math.min(appliedStars, baseStars), appliedBonusStars: Math.max(0, appliedStars - baseStars), appliedStars, unlockedPowerId: null, resetMilestones: [] };
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
    if (!pending || pending.ownerUserId !== action.userId || pending.id !== action.choiceId) {
      sendError(room, state, action.userId, io, "That Power Choice is no longer available.");
      return true;
    }
    const option = pending.options.find(item => item.id === action.optionId);
    if (!option) {
      sendError(room, state, action.userId, io, "Choose one of the three available cards.");
      return true;
    }
    applyChoice(state, option, pending, room, roomId, io);
    state.powerChoice.pendingChoice = null;
    emitRoomState(roomId, room, io);
    return true;
  }
  if (pending && pending.ownerUserId === action.userId && ["SUBMIT_GUESS", "SET_SECRET", "SET_SECRET_KEEP", "SET_SECRET_NEW", "USE_POWER"].includes(action.type)) {
    sendError(room, state, action.userId, io, "Choose a Power Choice card before continuing your turn.");
    return true;
  }
  if (action.type === "SUBMIT_GUESS" && action.userId === state.guesser) {
    const word = normalizeWord(action.guess);
    const blocked = (state.powerChoice.eliminatedLetters || []).find(letter => word.includes(letter));
    if (blocked) {
      sendError(room, state, action.userId, io, `${blocked} was ruled out by Power Choice and cannot be used.`);
      return true;
    }
  }
  return false;
}

module.exports = { MODE, isPowerChoice, initializeRound, handleAction, evaluateQuest, makeQuest };
