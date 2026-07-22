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
//   - REVERSEALPHA: ALPHA's mirror image -- 3 guesses whose letters are
//     in strict *descending* alphabetical order.
//   - HALF_AM / HALF_NZ: 3 guesses using only letters from the first or
//     second half of the alphabet respectively.
//   - VOWELSHORTAGE: 4 guesses (not necessarily consecutive) that each
//     contain exactly 1 vowel.
const engine = require("../powerEngineServer.js");
const { satisfiesForceGuess } = require("../../game-engine/validation");
const { generateConditions } = require("./fieldReportServer.js");

const QUEST_TYPES = [
  "ROW", "RARE", "ALPHA", "DOUBLES", "CHAIN", "HARDMODE", "FIELDREPORT",
  "ALTERNATING", "BOOKENDS", "REVERSEALPHA", "HALF_AM", "HALF_NZ", "VOWELSHORTAGE"
];

// Per-type "how many qualifying guesses does this quest need" -- shared by
// the switch below and by the AI's quest-aware guess picker
// (server/core/ai/genericAI.js), which needs to know how close a match's
// current progress is to done ("one away") without duplicating each
// case's threshold. FIELDREPORT counts individual conditions satisfied
// (summed across every guess), not qualifying guesses -- every other type
// counts one point per qualifying guess.
const QUEST_THRESHOLDS = {
  RARE: 5,
  ROW: 1, // "complete any one row" -- see rowsCompleted() below, not a plain count
  ALPHA: 3,
  DOUBLES: 3,
  CHAIN: 2,
  HARDMODE: 4,
  FIELDREPORT: 8,
  ALTERNATING: 3,
  BOOKENDS: 3,
  REVERSEALPHA: 3,
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

const QUEST_RARE_LETTERS = new Set("QJXZWKV");
const QUEST_KEYBOARD_ROWS = [
  new Set("QWERTYUIOP"),
  new Set("ASDFGHJKL"),
  new Set("ZXCVBNM")
];

// Number of guesses (any order, not necessarily consecutive) with exactly
// 1 vowel -- ready once 4 of them have been submitted.
function computeVowelShortageCount(history) {
  let count = 0;
  for (const entry of history) {
    if (!entry?.guess) continue;
    if (questCountVowels(entry.guess.toUpperCase()) === 1) count++;
  }
  return count;
}

function pickRandomQuestType() {
  return QUEST_TYPES[Math.floor(Math.random() * QUEST_TYPES.length)];
}

// ---- Shared progress helpers (used by the turnStart switch below AND by
// genericAI.js's quest-aware guess picker AND the early-claim feature) ----

function rareLettersSeen(history) {
  const seen = new Set();
  for (const h of history) {
    for (const c of h.guess.toUpperCase()) {
      if (QUEST_RARE_LETTERS.has(c)) seen.add(c);
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
      return rareLettersSeen(history).size === QUEST_THRESHOLDS.RARE - 1;
    case "ROW":
      return rowCoverage(history).some(({ row, used }) => row.size - used.size === 1);
    case "ALPHA":
      return history.filter(h => isAscendingWord(h.guess.toUpperCase())).length
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
      return computeFieldReportCount(history, quest.conditions) >= FIELDREPORT_YELLOW_AT;
    case "ALTERNATING":
      return history.filter(h => isAlternatingWord(h.guess.toUpperCase())).length
        === QUEST_THRESHOLDS.ALTERNATING - 1;
    case "BOOKENDS":
      return history.filter(h => isBookendWord(h.guess.toUpperCase())).length
        === QUEST_THRESHOLDS.BOOKENDS - 1;
    case "REVERSEALPHA":
      return history.filter(h => isReverseAlphaWord(h.guess.toUpperCase())).length
        === QUEST_THRESHOLDS.REVERSEALPHA - 1;
    case "HALF_AM":
      return history.filter(h => isInLetterRange(h.guess.toUpperCase(), "A", "M")).length
        === QUEST_THRESHOLDS.HALF_AM - 1;
    case "HALF_NZ":
      return history.filter(h => isInLetterRange(h.guess.toUpperCase(), "N", "Z")).length
        === QUEST_THRESHOLDS.HALF_NZ - 1;
    case "VOWELSHORTAGE":
      return computeVowelShortageCount(history) === QUEST_THRESHOLDS.VOWELSHORTAGE - 1;
    default:
      return false;
  }
}

// FIELDREPORT's conditions are generated once per round (not once per
// match -- they're tied to a random word, there's no reason to keep the
// same 3 across a role swap into a brand new secret) and lazily, the
// first time they're needed after a fresh state.powers.quest.
function ensureQuestConditions(state) {
  const q = state.powers?.quest;
  if (!q || q.type !== "FIELDREPORT" || q.conditions) return;
  q.conditions = generateConditions();
}

// Requirements accumulate guess-by-guess (green letters lock their
// position, yellow letters must appear somewhere) exactly like real
// Wordle hard mode -- a guess is checked against what was known BEFORE it
// was made, then its own feedback folds into the requirements for the
// next one.
// Pure per-word check against a given green/mustInclude snapshot -- split
// out of computeHardModeCount so genericAI.js's quest-aware guess picker
// can ask "would THIS candidate be hard-mode legal right now" without
// re-deriving the reduction logic itself.
function isHardModeCompliant(word, green, mustInclude) {
  const g = word.toUpperCase();
  for (let i = 0; i < 5; i++) {
    if (green[i] && g[i] !== green[i]) return false;
  }
  for (const letter of mustInclude) {
    if (!g.includes(letter)) return false;
  }
  return true;
}

// Folds one more history entry's feedback into a running green/mustInclude
// snapshot -- the other half of the split described above.
function foldHardModeConstraint(green, mustInclude, entry) {
  const fb = entry.fbGuesser || entry.fb;
  if (!Array.isArray(fb) || !entry.guess) return;
  const g = entry.guess.toUpperCase();
  for (let i = 0; i < 5; i++) {
    if (fb[i] === "🟩") green[i] = g[i];
    else if (fb[i] === "🟨") mustInclude.add(g[i]);
  }
}

// The green/mustInclude constraints implied by history SO FAR (i.e. what
// the NEXT guess would be checked against) -- used by the AI to evaluate
// hard-mode-legality of a not-yet-made guess.
function computeHardModeConstraints(history) {
  const green = [null, null, null, null, null];
  const mustInclude = new Set();
  for (const entry of history) foldHardModeConstraint(green, mustInclude, entry);
  return { green, mustInclude };
}

function computeHardModeCount(history) {
  const green = [null, null, null, null, null];
  const mustInclude = new Set();
  let count = 0;

  for (const entry of history) {
    const fb = entry.fbGuesser || entry.fb;
    if (!Array.isArray(fb) || !entry.guess) continue;
    const g = entry.guess.toUpperCase();

    if (isHardModeCompliant(g, green, mustInclude)) count++;

    foldHardModeConstraint(green, mustInclude, entry);
  }

  return count;
}

// Sums how many of the 3 conditions each guess satisfies across the whole
// round -- a guess that hits all 3 at once contributes 3, not 1, toward
// the total of 8 (see QUEST_THRESHOLDS.FIELDREPORT above).
function computeFieldReportCount(history, conditions) {
  if (!Array.isArray(conditions) || !conditions.length) return 0;
  let total = 0;
  for (const entry of history) {
    if (!entry?.guess) continue;
    total += conditions.filter(c => satisfiesForceGuess(entry.guess.toUpperCase(), c)).length;
  }
  return total;
}

// Same random-unrevealed-position mechanic revealLetter/fieldReport both
// used for their green reveal.
function grantQuestReward(state, roomId, io) {
  const q = state.powers.quest;
  q.used = true;
  q.ready = false;

  const greenPositions = new Set();
  for (const entry of state.history) {
    if (!entry?.fb) continue;
    for (let i = 0; i < 5; i++) {
      if (entry.fb[i] === "🟩") greenPositions.add(i);
    }
  }
  for (const c of state.extraConstraints ?? []) {
    if (c.type === "GREEN") greenPositions.add(c.index);
  }

  const options = [0, 1, 2, 3, 4].filter(i => !greenPositions.has(i));
  if (!options.length) return;

  const index = options[Math.floor(Math.random() * options.length)];
  const letter = state.secret[index].toUpperCase();

  state.extraConstraints ??= [];
  state.powers.questActive = true;
  if (!state.extraConstraints.some(c => c.type === "GREEN" && c.index === index)) {
    state.extraConstraints.push({ type: "GREEN", index, letter });
    io.to(roomId).emit("greenLetterRevealed", { index, letter, source: "quest" });
  }
  io.to(roomId).emit("questCompleted", { questType: q.type, index, letter });
  io.to(roomId).emit("toast", `Quest complete! Revealed letter ${letter} in position ${index + 1}!`);
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
    io.to(roomId).emit("questEarlyClaim", { questType: q.type, letter: null });
    io.to(roomId).emit("toast", "Quest claimed early, but there was nothing new left to reveal.");
    return;
  }

  const letter = options[Math.floor(Math.random() * options.length)];
  state.extraConstraints ??= [];
  state.extraConstraints.push({ type: "YELLOW", letter });
  io.to(roomId).emit("questEarlyClaim", { questType: q.type, letter });
  io.to(roomId).emit("toast", `Quest claimed early! ${letter} is somewhere in the secret.`);
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
  const q = state.powers?.quest;
  if (!q || !q.type || q.used) return false;
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
  turnStart(state, role, roomId, io) {
    if (role !== state.guesser) return;
    const q = state.powers?.quest;
    if (!q || !q.type || q.used) return;

    ensureQuestConditions(state);

    if (!q.ready) {
      switch (q.type) {
        case "RARE": {
          const seen = new Set();
          for (const h of state.history) {
            for (const c of h.guess.toUpperCase()) {
              if (QUEST_RARE_LETTERS.has(c)) seen.add(c);
            }
          }
          if (seen.size >= QUEST_THRESHOLDS.RARE) q.ready = true;
          break;
        }
        case "ROW": {
          const used = QUEST_KEYBOARD_ROWS.map(() => new Set());
          for (const h of state.history) {
            for (const c of h.guess.toUpperCase()) {
              QUEST_KEYBOARD_ROWS.forEach((row, i) => { if (row.has(c)) used[i].add(c); });
            }
          }
          if (QUEST_KEYBOARD_ROWS.some((row, i) => used[i].size === row.size)) q.ready = true;
          break;
        }
        case "ALPHA": {
          const count = state.history.filter(h => isAscendingWord(h.guess.toUpperCase())).length;
          if (count >= QUEST_THRESHOLDS.ALPHA) q.ready = true;
          break;
        }
        case "DOUBLES": {
          const doubles = new Set();
          for (const h of state.history) {
            const d = doubledLetterOf(h.guess.toUpperCase());
            if (d) doubles.add(d);
          }
          if (doubles.size >= QUEST_THRESHOLDS.DOUBLES) q.ready = true;
          break;
        }
        case "CHAIN": {
          let links = 0;
          for (let i = 1; i < state.history.length; i++) {
            const prev = state.history[i - 1].guess.toUpperCase();
            const curr = state.history[i].guess.toUpperCase();
            if (curr[0] === prev[4]) links++;
          }
          if (links >= QUEST_THRESHOLDS.CHAIN) q.ready = true;
          break;
        }
        case "HARDMODE": {
          if (computeHardModeCount(state.history) >= QUEST_THRESHOLDS.HARDMODE) q.ready = true;
          break;
        }
        case "FIELDREPORT": {
          if (computeFieldReportCount(state.history, q.conditions) >= QUEST_THRESHOLDS.FIELDREPORT) q.ready = true;
          break;
        }
        case "ALTERNATING": {
          const count = state.history.filter(h => isAlternatingWord(h.guess.toUpperCase())).length;
          if (count >= QUEST_THRESHOLDS.ALTERNATING) q.ready = true;
          break;
        }
        case "BOOKENDS": {
          const count = state.history.filter(h => isBookendWord(h.guess.toUpperCase())).length;
          if (count >= QUEST_THRESHOLDS.BOOKENDS) q.ready = true;
          break;
        }
        case "REVERSEALPHA": {
          const count = state.history.filter(h => isReverseAlphaWord(h.guess.toUpperCase())).length;
          if (count >= QUEST_THRESHOLDS.REVERSEALPHA) q.ready = true;
          break;
        }
        case "HALF_AM": {
          const count = state.history.filter(h => isInLetterRange(h.guess.toUpperCase(), "A", "M")).length;
          if (count >= QUEST_THRESHOLDS.HALF_AM) q.ready = true;
          break;
        }
        case "HALF_NZ": {
          const count = state.history.filter(h => isInLetterRange(h.guess.toUpperCase(), "N", "Z")).length;
          if (count >= QUEST_THRESHOLDS.HALF_NZ) q.ready = true;
          break;
        }
        case "VOWELSHORTAGE": {
          if (computeVowelShortageCount(state.history) >= QUEST_THRESHOLDS.VOWELSHORTAGE) q.ready = true;
          break;
        }
      }
      // No longer an auto-grant -- just lets the guesser know the badge is
      // now claimable. attemptQuestClaim (fired by tapping the badge) is
      // what actually reveals the green letter.
      if (q.ready) io.to(roomId).emit("toast", "Quest ready — tap the badge for your green letter!");
    }

    // Surfaced to the client as-is (safeState.js never redacts
    // state.powers.quest) so the guesser's info badge knows when to offer
    // the early-yellow-for-a-forfeited-green trade without re-deriving
    // any of the per-type counting logic itself.
    q.oneAway = !q.ready && !q.used && isQuestOneAway(q, state);
  }
});

module.exports = {
  QUEST_TYPES,
  QUEST_THRESHOLDS,
  FIELDREPORT_YELLOW_AT,
  QUEST_RARE_LETTERS,
  QUEST_KEYBOARD_ROWS,
  pickRandomQuestType,
  ensureQuestConditions,
  computeHardModeCount,
  computeHardModeConstraints,
  isHardModeCompliant,
  computeFieldReportCount,
  isAlternatingWord,
  isReverseAlphaWord,
  isInLetterRange,
  isAscendingWord,
  isBookendWord,
  doubledLetterOf,
  computeVowelShortageCount,
  rareLettersSeen,
  rowCoverage,
  doublesSeen,
  isQuestOneAway,
  attemptQuestClaim
};
