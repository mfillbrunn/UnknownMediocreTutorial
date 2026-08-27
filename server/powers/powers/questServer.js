// powers/powers/questServer.js — Guesser Quests
//
// Replaces the old revealLetter/fieldReport powers as the guesser's
// always-on route to a free green letter. Unlike those two, a quest isn't
// something the guesser opts into via the draft/random power pool and
// isn't hidden from the setter -- every guesser gets exactly one quest for
// the match (state.powers.quest.type, assigned in competitiveMode.js,
// persisted across the round-2 role swap by postGame.js exactly like
// revealLetter.mode used to be), and its criteria/progress are visible to
// both players (safeState.js has no redaction for state.powers.quest,
// same as it never had one for revealLetter/fieldReport).
//
// Registered as a fake "power" purely to piggyback on
// powerEngineServer.js's turnStart() dispatch -- it's not in any power
// pool, never appears in activePowers, and has no apply()/button, so none
// of the power-specific plumbing (draft offers, activation, logging) ever
// touches it except this one hook.
//
// ROW/RARE/ALPHA/DOUBLES/CHAIN mirror revealLetterServer.js's unlock
// conditions exactly (same thresholds, same wording) -- see that file for
// the original. The rest are new:
//   - HARDMODE: 4 guesses (across the whole round, including the
//     simultaneous-phase opener) that are each Wordle hard-mode legal
//     against everything known at the time that guess was made.
//   - FIELDREPORT: fieldReportServer.js's 3-condition vocabulary, but
//     instead of a one-shot "next guess only" check, every condition any
//     guess satisfies (summed across the whole round) counts toward a
//     total of 8 -- reaching 6 unlocks the early-yellow trade.
//   - ALTERNATING: 3 guesses with no two adjacent letters in the same
//     vowel/consonant category (CVCVC like MAGIC, or VCVCV -- either
//     direction counts).
//   - BOOKENDS: 3 guesses whose first and last letter are identical
//     (SEEDS, LEVEL).
//   - ALPHA: 3 guesses whose letters are in strict alphabetical order --
//     either ascending (ABHOR) or descending (POLKA) both count, checked
//     independently per guess (a 5-letter word can never satisfy both at
//     once, so there's no double-counting risk).
//   - HALF_AM / HALF_NZ: 3 guesses using only letters from the first or
//     second half of the alphabet respectively.
//   - VOWELSHORTAGE: 4 guesses (not necessarily consecutive) that each
//     contain exactly 1 vowel.
const engine = require("../powerEngineServer.js");
const { satisfiesForceGuess } = require("../../game-engine/validation");
const { generateConditions } = require("./fieldReportServer.js");

const QUEST_TYPES = [
  "ROW", "RARE", "ALPHA", "DOUBLES", "CHAIN", "HARDMODE", "FIELDREPORT",
  "ALTERNATING", "BOOKENDS", "HALF_AM", "HALF_NZ", "VOWELSHORTAGE"
];

// Per-type "how many qualifying guesses does this quest need" -- shared by
// the switch below and by the AI's quest-aware guess picker
// (server/core/ai/genericAI.js), which needs to know how close a match's
// current progress is to done ("one away") without duplicating each
// case's threshold. FIELDREPORT counts individual conditions satisfied
// (summed across every guess), not qualifying guesses -- every other type
// counts one point per qualifying guess.
const QUEST_THRESHOLDS = {
  RARE: 6,
  ROW: 1, // "complete any one row" -- see rowsCompleted() below, not a plain count
  ALPHA: 3,
  DOUBLES: 3,
  CHAIN: 2, // links between adjacent guesses, not guesses themselves -- 2 links is a 3-word chain (W1->W2->W3), matching QUEST_METADATA.CHAIN's "submit 3 guesses" and quest.js's client-side "x/2" label
  HARDMODE: 4,
  FIELDREPORT: 8,
  ALTERNATING: 3,
  BOOKENDS: 3,
  HALF_AM: 3,
  HALF_NZ: 3,
  VOWELSHORTAGE: 4
};

// FIELDREPORT's early-yellow checkpoint isn't "one condition short of 8"
// like every other quest's "one away" rule (a single guess can satisfy up
// to 3 conditions at once, so an exact target-1 match can easily get
// jumped over) -- it's a fixed checkpoint partway through the total.
const FIELDREPORT_YELLOW_AT = 6;

const QUEST_VOWELS = new Set("AEIOU");
function questCountVowels(word) {
  let n = 0;
  for (const c of word) if (QUEST_VOWELS.has(c)) n++;
  return n;
}

function isAlternatingWord(word) {
  for (let i = 1; i < word.length; i++) {
    if (QUEST_VOWELS.has(word[i]) === QUEST_VOWELS.has(word[i - 1])) return false;
  }
  return true;
}

function isReverseAlphaWord(word) {
  for (let i = 1; i < word.length; i++) {
    if (word.charCodeAt(i) >= word.charCodeAt(i - 1)) return false;
  }
  return true;
}

function isInLetterRange(word, minLetter, maxLetter) {
  const min = minLetter.charCodeAt(0);
  const max = maxLetter.charCodeAt(0);
  for (const c of word) {
    const code = c.charCodeAt(0);
    if (code < min || code > max) return false;
  }
  return true;
}

// ALPHA's condition (strict ascending letters, e.g. ABHOR) -- was a local
// closure inside the switch below; hoisted so the AI can reuse it too.
function isAscendingWord(word) {
  for (let i = 1; i < word.length; i++) {
    if (word.charCodeAt(i) <= word.charCodeAt(i - 1)) return false;
  }
  return true;
}

// ALPHA counts a guess whose letters are in strict alphabetical order in
// EITHER direction -- ascending (ABHOR) or descending (POLKA). A word can
// never satisfy both at once (that would require every adjacent pair to be
// both strictly increasing and strictly decreasing), so there's no risk of
// double-counting a single guess.
function isAlphaOrderedWord(word) {
  return isAscendingWord(word) || isReverseAlphaWord(word);
}

// BOOKENDS' condition (first letter === last letter, e.g. SEEDS).
function isBookendWord(word) {
  return word[0] === word[word.length - 1];
}

// DOUBLES' per-word check: the first doubled letter in the word, or null.
// A guess only counts toward DOUBLES if its doubled letter hasn't already
// been used by an earlier qualifying guess this round.
function doubledLetterOf(word) {
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === word[i + 1]) return word[i];
  }
  return null;
}

// Legacy fixed set, kept as the fallback for any quest instance that never
// got a rareLetters draw (the tutorial's scripted RARE round -- see
// tutorialMode.js, which sets state.powers.quest directly rather than
// through ensureQuestConditions below -- and old in-flight quests from
// before this pool existed).
const QUEST_RARE_LETTERS = new Set("QJXZWKV");

// The 16 rarest English letters a match can draw its 7 from (superset of
// the legacy 7 above). Drawing a random 7-of-16 each match instead of
// always the same fixed 7 keeps the RARE quest's target letters from
// being memorized/identical every game. The "use 6" threshold
// (QUEST_THRESHOLDS.RARE) still leaves exactly one drawn letter spare.
// C/M/P/D were added on top of the original 12 (QJXZWKVFYBHG) -- common
// enough to actually show up in guesses without much effort, so a draw
// that happens to land on several of them doesn't leave the quest
// nearly impossible for the rest of the match.
const QUEST_RARE_LETTER_POOL = "QJXZWKVFYBHGCMPD".split("");
const QUEST_RARE_DRAW_SIZE = 7;

function pickRareLetterSet() {
  const pool = [...QUEST_RARE_LETTER_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, QUEST_RARE_DRAW_SIZE);
}

// The Set a given quest's RARE checks should actually run against -- this
// match's own 7-letter draw once ensureQuestConditions has assigned one,
// falling back to the legacy fixed 7 otherwise (see QUEST_RARE_LETTERS's
// comment above).
function questRareLetterSet(quest) {
  return quest?.rareLetters?.length ? new Set(quest.rareLetters) : QUEST_RARE_LETTERS;
}

const QUEST_KEYBOARD_ROWS = [
  new Set("QWERTYUIOP"),
  new Set("ASDFGHJKL"),
  new Set("ZXCVBNM")
];

// Number of guesses (any order, not necessarily consecutive) with exactly
// 1 vowel -- ready once 4 of them have been submitted.
// V10_DYNAMIC_VOWEL_TARGET
function questVowelTarget(quest) {
  const value = Number(quest?.vowelTarget);
  return value >= 1 && value <= 3 ? value : 1;
}

function computeVowelShortageCount(history, quest) {
  const target = questVowelTarget(quest);
  let count = 0;
  for (const entry of history) {
    if (!entry?.guess) continue;
    if (questCountVowels(entry.guess.toUpperCase()) === target) count++;
  }
  return count;
}

function pickRandomQuestType() {
  return QUEST_TYPES[Math.floor(Math.random() * QUEST_TYPES.length)];
}

// Two DISTINCT quest types, for offering the guesser a choice (see
// nextRoundTransition.js and CHOOSE_QUEST below) -- mirrors lobby.js's
// draft-mode candidate generation (shuffle(QUEST_TYPES).slice(0, 2)) but
// lives here so every caller shares one implementation.
function pickTwoRandomQuestTypes() {
  const pool = [...QUEST_TYPES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 2);
}

// Resolves a guesser's mid-match quest choice (see state.powers.quest.
// pendingChoice's header comment in stateFactory.js) -- validates the pick
// against the actual offered candidates, same shape as draft.js's
// DRAFT_PICK_QUEST validation, just applied directly instead of staged in
// a picks array (there's only ever one final choice here, no toggle-to-
// deselect step). Returns false (no-op, caller skips the broadcast) on any
// invalid attempt: wrong player, no choice pending, or an unoffered type.
function chooseQuestType(state, userId, type) {
  if (userId !== state.guesser) return false;
  const q = state.powers?.quest;
  if (!q || !Array.isArray(q.pendingChoice) || !q.pendingChoice.includes(type)) return false;

  q.type = type;
  q.pendingChoice = null;
  ensureQuestConditions(state);
  return true;
}

// ---- Shared progress helpers (used by the turnStart switch below AND by
// genericAI.js's quest-aware guess picker AND the early-claim feature) ----

function rareLettersSeen(history, letters) {
  const set = letters || QUEST_RARE_LETTERS;
  const seen = new Set();
  for (const h of history) {
    for (const c of h.guess.toUpperCase()) {
      if (set.has(c)) seen.add(c);
    }
  }
  return seen;
}

// One entry per keyboard row: { row: Set, used: Set } for letters of that
// row already covered by a past guess this round.
function rowCoverage(history) {
  return QUEST_KEYBOARD_ROWS.map(row => {
    const used = new Set();
    for (const h of history) {
      for (const c of h.guess.toUpperCase()) {
        if (row.has(c)) used.add(c);
      }
    }
    return { row, used };
  });
}

function doublesSeen(history) {
  const seen = new Set();
  for (const h of history) {
    const d = doubledLetterOf(h.guess.toUpperCase());
    if (d) seen.add(d);
  }
  return seen;
}

// Is the quest exactly one qualifying guess away from complete? Mirrors
// each case's threshold (QUEST_THRESHOLDS) against its current progress
// count -- used both by the AI's quest-aware guess picker (to know when to
// always try) and by the early-claim feature below (to gate the
// yellow-for-a-forfeited-green trade). ROW/RARE are coverage-based rather
// than a flat count, so "one away" means exactly one letter short
// somewhere.
function isQuestOneAway(quest, state) {
  const history = state.history || [];
  switch (quest.type) {
    case "RARE":
      return rareLettersSeen(history, questRareLetterSet(quest)).size === QUEST_THRESHOLDS.RARE - 1;
    case "ROW":
      return rowCoverage(history).some(({ row, used }) => row.size - used.size === 1);
    case "ALPHA":
      return history.filter(h => isAlphaOrderedWord(h.guess.toUpperCase())).length
        === QUEST_THRESHOLDS.ALPHA - 1;
    case "DOUBLES":
      return doublesSeen(history).size === QUEST_THRESHOLDS.DOUBLES - 1;
    case "CHAIN": {
      let links = 0;
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1].guess.toUpperCase();
        const curr = history[i].guess.toUpperCase();
        if (curr[0] === prev[4]) links++;
      }
      return links === QUEST_THRESHOLDS.CHAIN - 1;
    }
    case "HARDMODE":
      return computeHardModeCount(history) === QUEST_THRESHOLDS.HARDMODE - 1;
    case "FIELDREPORT":
      return computeFieldReportCount(history, quest.conditionsHistory) >= FIELDREPORT_YELLOW_AT;
    case "ALTERNATING":
      return history.filter(h => isAlternatingWord(h.guess.toUpperCase())).length
        === QUEST_THRESHOLDS.ALTERNATING - 1;
    case "BOOKENDS":
      return history.filter(h => isBookendWord(h.guess.toUpperCase())).length
        === QUEST_THRESHOLDS.BOOKENDS - 1;
    case "HALF_AM":
      return history.filter(h => isInLetterRange(h.guess.toUpperCase(), "A", "P")).length
        === QUEST_THRESHOLDS.HALF_AM - 1;
    case "HALF_NZ":
      return history.filter(h => isInLetterRange(h.guess.toUpperCase(), "K", "Z")).length
        === QUEST_THRESHOLDS.HALF_NZ - 1;
    case "VOWELSHORTAGE":
      return computeVowelShortageCount(history, quest) === QUEST_THRESHOLDS.VOWELSHORTAGE - 1;
    default:
      return false;
  }
}

// FIELDREPORT's conditions are generated once per round (not once per
// match -- they're tied to a random word, there's no reason to keep the
// same 3 across a role swap into a brand new secret) and lazily, the
// first time they're needed after a fresh state.powers.quest. RARE's
// 7-letter draw (see QUEST_RARE_LETTER_POOL above) is set up the same
// lazy way, off the same call -- every site that assigns q.type already
// calls this right after, so it's the one shared place to hook both.
function ensureQuestConditions(state) {
  const q = state.powers?.quest;
  if (!q) return;

  if (q.type === "FIELDREPORT" && !q.conditions) {
    q.conditions = generateConditions();
  }

  if (q.type === "RARE" && !q.rareLetters?.length) {
    q.rareLetters = pickRareLetterSet();
  }

  if (q.type === "VOWELSHORTAGE") {
    const current = Number(q.vowelTarget);
    if (current < 1 || current > 3) {
      q.vowelTarget = 1 + Math.floor(Math.random() * 3);
    }
  } else {
    q.vowelTarget = null;
  }
}

// Requirements accumulate guess-by-guess (green letters lock their
// position, yellow letters must appear somewhere) exactly like real
// Wordle hard mode -- a guess is checked against what was known BEFORE it
// was made, then its own feedback folds into the requirements for the
// next one.
// Pure per-word check against a given green/mustInclude/absent snapshot --
// split out of computeHardModeCount so genericAI.js's quest-aware guess
// picker can ask "would THIS candidate be hard-mode legal right now"
// without re-deriving the reduction logic itself. mustInclude is a
// Map<letter, Set<excludedPositions>> -- a yellow letter must appear
// somewhere in the guess (like real Wordle hard mode) AND must not be
// placed back at a position it already came back yellow at (yellow means
// "in the word, not here"). absent is a Set<letter> confirmed NOT in the
// secret (grayed out with no green/yellow for that letter anywhere in the
// same guess) -- reusing any of them is never hard-mode legal, UNLESS
// green/mustInclude separately requires that same letter (a mid-round
// secret change can otherwise leave a letter both "required" and
// "absent" from two different secrets; the requirement wins rather than
// permanently locking the quest out).
function isHardModeCompliant(word, green, mustInclude, absent) {
  const g = word.toUpperCase();

  const required = new Set(mustInclude.keys());
  for (const letter of green) if (letter) required.add(letter);

  for (let i = 0; i < 5; i++) {
    if (green[i] && g[i] !== green[i]) return false;
  }
  for (const [letter, excludedPositions] of mustInclude) {
    if (!g.includes(letter)) return false;
    for (const pos of excludedPositions) {
      if (g[pos] === letter) return false;
    }
  }
  if (absent) {
    for (const letter of g) {
      if (absent.has(letter) && !required.has(letter)) return false;
    }
  }
  return true;
}

// Folds one more history entry's feedback into a running
// green/mustInclude/absent snapshot -- the other half of the split
// described above.
function foldHardModeConstraint(green, mustInclude, absent, entry) {
  const fb = entry.fbGuesser || entry.fb;
  if (!Array.isArray(fb) || !entry.guess) return;
  const g = entry.guess.toUpperCase();

  // A letter grayed out in THIS guess is confirmed absent from the
  // secret -- unless this same guess ALSO turned up a green/yellow for
  // it elsewhere. That covers the duplicate-letter case: guessing a
  // letter more times than the secret actually contains it grays out the
  // extra copies even though the letter itself is present, and that
  // shouldn't ban every future use of it.
  const positiveLettersThisGuess = new Set();
  for (let i = 0; i < 5; i++) {
    if (fb[i] === "🟩" || fb[i] === "🟨") positiveLettersThisGuess.add(g[i]);
  }

  for (let i = 0; i < 5; i++) {
    if (fb[i] === "🟩") green[i] = g[i];
    else if (fb[i] === "🟨") {
      if (!mustInclude.has(g[i])) mustInclude.set(g[i], new Set());
      mustInclude.get(g[i]).add(i);
    } else if (fb[i] === "⬛" && !positiveLettersThisGuess.has(g[i])) {
      absent.add(g[i]);
    }
  }
}

// The green/mustInclude/absent constraints implied by history SO FAR
// (i.e. what the NEXT guess would be checked against) -- used by the AI
// to evaluate hard-mode-legality of a not-yet-made guess.
function computeHardModeConstraints(history) {
  const green = [null, null, null, null, null];
  const mustInclude = new Map();
  const absent = new Set();
  for (const entry of history) foldHardModeConstraint(green, mustInclude, absent, entry);
  return { green, mustInclude, absent };
}

function computeHardModeCount(history) {
  const green = [null, null, null, null, null];
  const mustInclude = new Map();
  const absent = new Set();
  let count = 0;

  for (const entry of history) {
    const fb = entry.fbGuesser || entry.fb;
    if (!Array.isArray(fb) || !entry.guess) continue;
    const g = entry.guess.toUpperCase();

    if (isHardModeCompliant(g, green, mustInclude, absent)) count++;

    foldHardModeConstraint(green, mustInclude, absent, entry);
  }

  return count;
}

// Sums how many of the 3 conditions each guess satisfies across the whole
// round -- a guess that hits all 3 at once contributes 3, not 1, toward
// the total of 8 (see QUEST_THRESHOLDS.FIELDREPORT above). Each guess is
// scored against whichever conditions were actually active THAT turn
// (conditionsHistory[i], recorded by ensureFieldReportProgress below) --
// conditions refresh every turn, so replaying old guesses against
// TODAY's conditions would score them against rules they were never
// judged on.
function computeFieldReportCount(history, conditionsHistory) {
  if (!Array.isArray(conditionsHistory)) return 0;
  let total = 0;
  history.forEach((entry, i) => {
    const conditions = conditionsHistory[i];
    if (!entry?.guess || !Array.isArray(conditions)) return;
    total += conditions.filter(c => satisfiesForceGuess(entry.guess.toUpperCase(), c)).length;
  });
  return total;
}

// Catches up conditionsHistory to state.history: for every guess added
// since the last call, records whichever q.conditions were live at that
// point, then rolls q.conditions over to a fresh random set for the next
// guess. Called from both onGuessSubmitted (one new guess at a time) and
// turnStart (a safety net that can catch more than one, e.g. the
// simultaneous-phase opener onGuessSubmitted never sees directly) --
// idempotent either way, since it only ever advances past what's already
// been recorded.
function ensureFieldReportProgress(state) {
  const q = state.powers?.quest;
  if (!q || q.type !== "FIELDREPORT") return;
  if (!q.conditions) q.conditions = generateConditions();
  if (!Array.isArray(q.conditionsHistory)) q.conditionsHistory = [];
  const history = state.history || [];
  while (q.conditionsHistory.length < history.length) {
    q.conditionsHistory.push(q.conditions);
    q.conditions = generateConditions();
  }
}

// Is the quest fully satisfied? Mirrors each case's threshold against its
// current progress count over the given history -- shared by turnStart
// (finalized history) and evaluateQuestProgress below (history plus a
// not-yet-scored pending guess), so the two hooks can't drift apart.
function isQuestReady(quest, history) {
  switch (quest.type) {
    case "RARE":
      return rareLettersSeen(history, questRareLetterSet(quest)).size >= QUEST_THRESHOLDS.RARE;
    case "ROW":
      return rowCoverage(history).some(({ row, used }) => used.size >= row.size);
    case "ALPHA":
      return history.filter(h => isAlphaOrderedWord(h.guess.toUpperCase())).length
        >= QUEST_THRESHOLDS.ALPHA;
    case "DOUBLES":
      return doublesSeen(history).size >= QUEST_THRESHOLDS.DOUBLES;
    case "CHAIN": {
      let links = 0;
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1].guess.toUpperCase();
        const curr = history[i].guess.toUpperCase();
        if (curr[0] === prev[4]) links++;
      }
      return links >= QUEST_THRESHOLDS.CHAIN;
    }
    case "HARDMODE":
      return computeHardModeCount(history) >= QUEST_THRESHOLDS.HARDMODE;
    case "FIELDREPORT":
      return computeFieldReportCount(history, quest.conditionsHistory) >= QUEST_THRESHOLDS.FIELDREPORT;
    case "ALTERNATING":
      return history.filter(h => isAlternatingWord(h.guess.toUpperCase())).length
        >= QUEST_THRESHOLDS.ALTERNATING;
    case "BOOKENDS":
      return history.filter(h => isBookendWord(h.guess.toUpperCase())).length
        >= QUEST_THRESHOLDS.BOOKENDS;
    case "HALF_AM":
      return history.filter(h => isInLetterRange(h.guess.toUpperCase(), "A", "P")).length
        >= QUEST_THRESHOLDS.HALF_AM;
    case "HALF_NZ":
      return history.filter(h => isInLetterRange(h.guess.toUpperCase(), "K", "Z")).length
        >= QUEST_THRESHOLDS.HALF_NZ;
    case "VOWELSHORTAGE":
      return computeVowelShortageCount(history, quest) >= QUEST_THRESHOLDS.VOWELSHORTAGE;
    default:
      return false;
  }
}

// Evaluates ready/oneAway against history PLUS a guess that was just
// submitted but hasn't been scored yet (no history entry for it exists
// until the setter reacts and finalizeFeedback.js runs) -- called from
// onGuessSubmitted so the quest badge updates the instant the guesser
// submits, not several steps later once it's the guesser's turn again.
// HARDMODE can't just append a fake `{ guess }` entry like every other
// type: its check depends on that entry's OWN feedback (not known yet) to
// decide what carries forward, but its COMPLIANCE only depends on
// history-so-far's accumulated constraints -- so it's evaluated directly
// against computeHardModeConstraints instead of going through the
// history-array-based isQuestReady/isQuestOneAway at all.
function evaluateQuestProgress(quest, state, pendingGuess) {
  const history = state.history || [];

  if (quest.type === "HARDMODE") {
    const { green, mustInclude, absent } = computeHardModeConstraints(history);
    const count = computeHardModeCount(history)
      + (isHardModeCompliant(pendingGuess, green, mustInclude, absent) ? 1 : 0);
    return {
      ready: count >= QUEST_THRESHOLDS.HARDMODE,
      oneAway: count === QUEST_THRESHOLDS.HARDMODE - 1
    };
  }

  // FIELDREPORT can't go through the generic history-replay path below
  // either: pendingGuess hasn't been scored against a conditions snapshot
  // yet (that only happens once it actually lands in history -- see
  // ensureFieldReportProgress), so it has to be checked against the
  // CURRENT q.conditions directly and added on top of the already-
  // recorded total for every prior guess.
  if (quest.type === "FIELDREPORT") {
    ensureFieldReportProgress(state);
    const priorCount = computeFieldReportCount(history, quest.conditionsHistory);
    const pendingCount = quest.conditions.filter(c => satisfiesForceGuess(pendingGuess.toUpperCase(), c)).length;
    const total = priorCount + pendingCount;
    return {
      ready: total >= QUEST_THRESHOLDS.FIELDREPORT,
      oneAway: total < QUEST_THRESHOLDS.FIELDREPORT && total >= FIELDREPORT_YELLOW_AT
    };
  }

  const pendingHistory = [...history, { guess: pendingGuess }];
  const ready = isQuestReady(quest, pendingHistory);
  return {
    ready,
    oneAway: !ready && isQuestOneAway(quest, { history: pendingHistory })
  };
}

// Persisted action-log entry for a quest reward -- shared by both
// grantQuestReward (green, below) and grantQuestYellowEarly (yellow, further
// down) so an early claim isn't lost once the round archives (action-log.js's
// "Quest: <type> — <result>" status line only covers the round currently in
// progress -- state._pendingPowerEvents/entry.powerEvents is what carries
// the actual result forward into history/matchRounds). The event name
// ("questCompleted" vs "questEarlyClaim") lets power-log-format.js tell the
// two apart instead of both collapsing into one generic "Quest completed"
// line regardless of which reward was actually granted.
//
// USE_QUEST is a standing-option click (see attemptQuestClaim below), not a
// normal apply()/postScore() power activation, so it isn't wrapped by
// logPowerUse.js's automatic emit capture -- push the log line directly in
// the same shape that capture would have produced.
function pushQuestLogEvent(state, roomId, io, event, payload) {
  if (!Array.isArray(state._pendingPowerEvents)) state._pendingPowerEvents = [];
  const logPayload = {
    id: "quest",
    actorRole: "guesser",
    emissions: [{ event, payload }]
  };
  state._pendingPowerEvents.push(logPayload);
  io.to(roomId).emit("powerActivity", logPayload);
}

// Same random-unrevealed-position mechanic revealLetter/fieldReport both
// used for their green reveal.
function grantQuestReward(state, roomId, io) {
  const q = state.powers.quest;
  q.used = true;
  q.ready = false;

  const greenPositions = new Set();
  const yellowLetters = new Set();
  for (const entry of state.history) {
    if (!entry?.fb) continue;
    for (let i = 0; i < 5; i++) {
      if (entry.fb[i] === "🟩") greenPositions.add(i);
      else if (entry.fb[i] === "🟨") yellowLetters.add(entry.guess[i].toUpperCase());
    }
  }
  for (const c of state.extraConstraints ?? []) {
    if (c.type === "GREEN") greenPositions.add(c.index);
    else if (c.type === "YELLOW") yellowLetters.add(c.letter.toUpperCase());
  }

  const options = [0, 1, 2, 3, 4].filter(i => !greenPositions.has(i));
  if (!options.length) return;

  // Prefer a genuinely fresh letter (never seen as green or yellow) over
  // one that's already known yellow -- only fall back to a stale letter
  // if every remaining position's letter has already been given away.
  const freshOptions = options.filter(i => !yellowLetters.has(state.secret[i].toUpperCase()));
  const pool = freshOptions.length ? freshOptions : options;

  const index = pool[Math.floor(Math.random() * pool.length)];
  const letter = state.secret[index].toUpperCase();

  state.extraConstraints ??= [];
  state.powers.questActive = true;
  // Persist the reward on the quest itself so the quest badge can show the
  // actual result (which letter, which color, and -- for a green -- where)
  // instead of a generic "complete" line, and so it survives re-renders /
  // rejoins as plain state rather than only living in the one-shot event.
  q.resultColor = "green";
  q.resultLetter = letter;
  q.resultIndex = index;
  if (!state.extraConstraints.some(c => c.type === "GREEN" && c.index === index)) {
    state.extraConstraints.push({ type: "GREEN", index, letter });
    io.to(roomId).emit("greenLetterRevealed", { index, letter, source: "quest" });
  }
  io.to(roomId).emit("questCompleted", { questType: q.type, index, letter });
  io.to(roomId).emit("toast", `Quest complete! Revealed letter ${letter} in position ${index + 1}!`);

  pushQuestLogEvent(state, roomId, io, "questCompleted", { questType: q.type, index, letter });
}

// Early-claim trade: once a quest is exactly one qualifying guess away
// from its green reward, the guesser can cash it in right now for a
// yellow letter (present, position unknown) instead of waiting -- but
// that spends the quest's one-time use, same as grantQuestReward does, so
// there's no green later even if they go on to actually complete it.
// Mirrors fieldReportServer.js's 2-of-3 yellow reward exactly (same
// "known letters" exclusion set, same random pick among the rest).
function grantQuestYellowEarly(state, roomId, io) {
  const q = state.powers.quest;
  q.used = true;
  q.ready = false;
  // Distinguishes this from a normal grantQuestReward() completion so the
  // client can show "claimed early" instead of "complete!" -- both set
  // q.used, but only one of them actually finished the quest's condition.
  q.claimedEarly = true;

  const known = new Set();
  for (const past of state.history ?? []) {
    if (!past?.fb) continue;
    for (let i = 0; i < 5; i++) {
      if (past.fb[i] === "🟩" || past.fb[i] === "🟨") known.add(past.guess[i]);
    }
  }
  for (const c of state.extraConstraints ?? []) {
    if (c.letter) known.add(c.letter.toUpperCase());
  }

  const secretLetters = [...new Set(state.secret.toUpperCase().split(""))];
  const options = secretLetters.filter(l => !known.has(l));

  if (!options.length) {
    q.resultColor = "yellow";
    q.resultLetter = null;
    io.to(roomId).emit("questEarlyClaim", { questType: q.type, letter: null });
    io.to(roomId).emit("toast", "Quest claimed early, but there was nothing new left to reveal.");
    pushQuestLogEvent(state, roomId, io, "questEarlyClaim", { questType: q.type, letter: null });
    return;
  }

  const letter = options[Math.floor(Math.random() * options.length)];
  state.extraConstraints ??= [];
  state.extraConstraints.push({ type: "YELLOW", letter });
  // Same reason as grantQuestReward: badge shows the actual yellow letter.
  q.resultColor = "yellow";
  q.resultLetter = letter;
  io.to(roomId).emit("questEarlyClaim", { questType: q.type, letter });
  io.to(roomId).emit("toast", `Quest claimed early! ${letter} is somewhere in the secret.`);
  pushQuestLogEvent(state, roomId, io, "questEarlyClaim", { questType: q.type, letter });
}

// Entry point for the guesser's own click on the quest badge -- covers
// BOTH reward states with one action: once the quest is ready, claim the
// real green letter; otherwise, if it's exactly one guess away, claim the
// early yellow trade instead. Neither reward is granted automatically
// anymore (see turnStart below) -- the guesser always has to tap for it.
// Returns false (no-op) if neither is actually available right now, so
// the caller can skip the room broadcast entirely on a stale/duplicate
// click.
function attemptQuestClaim(state, userId, roomId, io) {
  if (userId !== state.guesser) return false;
  // Only claimable on the guesser's OWN turn -- the reward reads
  // state.secret directly at the moment of the claim (see
  // grantQuestReward/grantQuestYellowEarly below), so claiming while the
  // setter is still mid-Keep/New would lock in info about whatever
  // secret happened to still be sitting there, not necessarily what the
  // setter ends up committing to.
  if (state.turn !== state.guesser) return false;
  const q = state.powers?.quest;
  if (!q || !q.type || q.used) return false;
  ensureFieldReportProgress(state);
  if (q.ready) {
    grantQuestReward(state, roomId, io);
    return true;
  }
  if (isQuestOneAway(q, state)) {
    grantQuestYellowEarly(state, roomId, io);
    return true;
  }
  return false;
}

engine.registerPower("quest", {
  // Progress is evaluated in onGuessSubmitted below (fires the instant the
  // guesser submits, before the setter's Keep/New reaction) -- this hook
  // now only handles setup (FIELDREPORT's conditions need to exist before
  // the first guess, for the badge subtext) and re-derives ready/oneAway
  // from the now-finalized history as a safety net for guesses
  // onGuessSubmitted didn't see it submit directly, e.g. the
  // simultaneous-phase opening guess.
  turnStart(state, role, roomId, io) {
    if (role !== state.guesser) return;
    const q = state.powers?.quest;
    if (!q || !q.type || q.used) return;

    ensureFieldReportProgress(state);

    if (!q.ready && isQuestReady(q, state.history || [])) {
      q.ready = true;
      // No longer an auto-grant -- just lets the guesser know the badge is
      // now claimable. attemptQuestClaim (fired by tapping the badge) is
      // what actually reveals the green letter.
      io.to(roomId).emit("toast", "Quest ready — tap the badge for your green letter!");
    }

    // Surfaced to the client as-is (safeState.js never redacts
    // state.powers.quest) so the guesser's info badge knows when to offer
    // the early-yellow-for-a-forfeited-green trade without re-deriving
    // any of the per-type counting logic itself.
    q.oneAway = !q.ready && !q.used && isQuestOneAway(q, state);
  },

  // Fires the instant the guesser submits a guess, before the setter has
  // reacted (Keep/New) and long before the guess lands in state.history
  // (see finalizeFeedback.js) -- see evaluateQuestProgress's header for
  // why this can't just wait for turnStart. Mirrors
  // fieldReportServer.js's own onGuessSubmitted use for the same reason:
  // this quest's progress only depends on the guess word itself (or, for
  // HARDMODE, on constraints already known from history), so there's no
  // need to wait for it to be scored.
  onGuessSubmitted(state, guess, roomId, io) {
    const q = state.powers?.quest;
    if (!q || !q.type || q.used || q.ready) return;

    ensureFieldReportProgress(state);

    const { ready, oneAway } = evaluateQuestProgress(q, state, guess);
    if (ready) {
      q.ready = true;
      q.oneAway = false;
      io.to(roomId).emit("toast", "Quest ready — tap the badge for your green letter!");
    } else {
      q.oneAway = oneAway;
    }
  }
});

// Re-derives ready/oneAway from state.history as it stands RIGHT NOW.
// Unlike onGuessSubmitted/turnStart above (which only ever latch ready
// from false to true, as a one-way "the guesser just earned this"
// signal), this can also correct ready back to false -- needed because a
// handful of setter-side effects erase or demote PAST feedback well
// after a quest's readiness was already latched in: a Power Choice
// reward (Fade a Green, Erase Two Clues, Trade a Yellow, ...), the
// classic per-turn letter reset (spyChargeServer.js's attemptReset),
// Vowel Refresh, and Hide Evidence all funnel through
// resetLetterKnowledge.js's eraseLetterKnowledge, which calls this after
// every erasure. A HARDMODE guess that was compliant against the
// green/mustInclude constraints in force when it was made can stop being
// compliant once an earlier green gets demoted to yellow, for example --
// without this, the badge stayed lit "ready" (or worse, claimable) even
// though the history it was computed from no longer supports it.
// FIELDREPORT and an already-claimed quest have nothing to correct here:
// FIELDREPORT's own conditions/history-based check already reads
// state.history the same way isQuestReady does, and q.used means the
// reward is already granted.
function resyncQuestReadiness(state) {
  const q = state?.powers?.quest;
  if (!q || !q.type || q.used) return;

  const ready = isQuestReady(q, state.history || []);
  q.ready = ready;
  q.oneAway = !ready && isQuestOneAway(q, state);
}

module.exports = {
  QUEST_TYPES,
  QUEST_THRESHOLDS,
  FIELDREPORT_YELLOW_AT,
  QUEST_RARE_LETTERS,
  QUEST_RARE_LETTER_POOL,
  QUEST_RARE_DRAW_SIZE,
  pickRareLetterSet,
  questRareLetterSet,
  QUEST_KEYBOARD_ROWS,
  pickRandomQuestType,
  pickTwoRandomQuestTypes,
  chooseQuestType,
  ensureQuestConditions,
  ensureFieldReportProgress,
  computeHardModeCount,
  computeHardModeConstraints,
  isHardModeCompliant,
  computeFieldReportCount,
  isAlternatingWord,
  isReverseAlphaWord,
  isInLetterRange,
  isAscendingWord,
  isAlphaOrderedWord,
  isBookendWord,
  doubledLetterOf,
  questVowelTarget,
  computeVowelShortageCount,
  rareLettersSeen,
  rowCoverage,
  doublesSeen,
  isQuestReady,
  isQuestOneAway,
  evaluateQuestProgress,
  resyncQuestReadiness,
  attemptQuestClaim
};
