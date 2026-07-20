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
// the original. HARDMODE and FIELDREPORT are new:
//   - HARDMODE: 4 guesses (across the whole round, including the
//     simultaneous-phase opener) that are each Wordle hard-mode legal
//     against everything known at the time that guess was made.
//   - FIELDREPORT: fieldReportServer.js's 3-condition vocabulary, but
//     instead of a one-shot "next guess only" check, the guesser needs 3
//     separate guesses that each satisfy at least 2 of the 3 conditions.
const engine = require("../powerEngineServer.js");
const { satisfiesForceGuess } = require("../../game-engine/validation");
const { generateConditions } = require("./fieldReportServer.js");

const QUEST_TYPES = ["ROW", "RARE", "ALPHA", "DOUBLES", "CHAIN", "HARDMODE", "FIELDREPORT"];

function pickRandomQuestType() {
  return QUEST_TYPES[Math.floor(Math.random() * QUEST_TYPES.length)];
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
function computeHardModeCount(history) {
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

function computeFieldReportCount(history, conditions) {
  if (!Array.isArray(conditions) || !conditions.length) return 0;
  let count = 0;
  for (const entry of history) {
    if (!entry?.guess) continue;
    const metCount = conditions.filter(c => satisfiesForceGuess(entry.guess.toUpperCase(), c)).length;
    if (metCount >= 2) count++;
  }
  return count;
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

engine.registerPower("quest", {
  turnStart(state, role, roomId, io) {
    if (role !== state.guesser) return;
    const q = state.powers?.quest;
    if (!q || !q.type || q.used) return;

    ensureQuestConditions(state);

    if (!q.ready) {
      switch (q.type) {
        case "RARE": {
          const rare = new Set("QJXZWKV");
          const seen = new Set();
          for (const h of state.history) {
            for (const c of h.guess.toUpperCase()) {
              if (rare.has(c)) seen.add(c);
            }
          }
          if (seen.size >= 4) q.ready = true;
          break;
        }
        case "ROW": {
          const rows = [new Set("QWERTYUIOP"), new Set("ASDFGHJKL"), new Set("ZXCVBNM")];
          const used = rows.map(() => new Set());
          for (const h of state.history) {
            for (const c of h.guess.toUpperCase()) {
              rows.forEach((row, i) => { if (row.has(c)) used[i].add(c); });
            }
          }
          if (rows.some((row, i) => used[i].size === row.size)) q.ready = true;
          break;
        }
        case "ALPHA": {
          const isAscending = word => {
            for (let i = 1; i < word.length; i++) {
              if (word.charCodeAt(i) <= word.charCodeAt(i - 1)) return false;
            }
            return true;
          };
          const count = state.history.filter(h => isAscending(h.guess.toUpperCase())).length;
          if (count >= 3) q.ready = true;
          break;
        }
        case "DOUBLES": {
          const doubles = new Set();
          for (const h of state.history) {
            const w = h.guess.toUpperCase();
            for (let i = 0; i < w.length - 1; i++) {
              if (w[i] === w[i + 1]) { doubles.add(w[i]); break; }
            }
          }
          if (doubles.size >= 3) q.ready = true;
          break;
        }
        case "CHAIN": {
          let links = 0;
          for (let i = 1; i < state.history.length; i++) {
            const prev = state.history[i - 1].guess.toUpperCase();
            const curr = state.history[i].guess.toUpperCase();
            if (curr[0] === prev[4]) links++;
          }
          if (links >= 2) q.ready = true;
          break;
        }
        case "HARDMODE": {
          if (computeHardModeCount(state.history) >= 4) q.ready = true;
          break;
        }
        case "FIELDREPORT": {
          if (computeFieldReportCount(state.history, q.conditions) >= 3) q.ready = true;
          break;
        }
      }
      if (q.ready) io.to(roomId).emit("toast", "Quest complete!");
    }

    if (q.ready && !q.used && state.history.length) {
      grantQuestReward(state, roomId, io);
    }
  }
});

module.exports = {
  QUEST_TYPES,
  pickRandomQuestType,
  ensureQuestConditions,
  computeHardModeCount,
  computeFieldReportCount
};
