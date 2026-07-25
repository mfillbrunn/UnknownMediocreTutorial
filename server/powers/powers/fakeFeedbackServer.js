// /powers/powers/fakeFeedbackServer.js — Falsify Intel (setter power)
//
// Shows the guesser TWO feedbacks for their guess (one true, one fake,
// alternating on the tiles) so they can't trust the reading. The fake is
// built directly from THIS guess's real feedback rather than by scoring an
// alternate secret: take the true feedback, work out which positions the
// guesser could already deduce on their own, then flip some of the
// remaining ("unknown") positions to a different color.
//
// Defining "known" is the crux. It doesn't have to be airtight, just not
// obviously wrong -- if we lied about a tile the guesser can already prove
// the color of, the fake reads as broken. Positions treated as known:
//
//   1. Exact (position, letter) repeat. If an earlier guess placed this
//      same letter at this same position, secret consistency (enforced on
//      every secret submission via isConsistentWithHistory) forces the
//      current color there to match what it was then -- the guesser can
//      derive it. Covers "the 3rd tile was green last round too".
//   2. Letter globally eliminated. If the letter is confirmed absent
//      everywhere (gray on the keyboard, never green/yellow), the guesser
//      knows every occurrence of it is gray.
//   3. Letter force-revealed green at this exact position by a power
//      (extraConstraints GREEN with a matching index/letter).
//   4. A light inference: a letter confirmed present whose only remaining
//      possible home is this position (every other slot already has a
//      different confirmed green, or forbids this letter) must be green
//      here -- so a true green there is known.
//
// Left fakeable: a letter merely confirmed present somewhere but not pinned
// to this position -- the classic green-vs-yellow ambiguity this power
// exists to exploit.
const engine = require("../powerEngineServer.js");
const { scoreGuess } = require("../../game-engine/scoring");
const { buildKeyboardState } = require("../../game-engine/keyboardState");

// The three ordinary feedback colors a fake tile is allowed to show. Blue
// (confuseColors) / purple (blindSpot) special tiles are never faked --
// they'd look broken -- so they're excluded here and skipped below.
const FAKEABLE = ["🟩", "🟨", "⬛"];

function computeKnownMask(state, guess, trueFb) {
  const { keyboard } = buildKeyboardState(state);
  const history = Array.isArray(state.history) ? state.history : [];

  const forcedGreenAt = {};
  for (const c of state.extraConstraints ?? []) {
    if (c?.type === "GREEN" && typeof c.index === "number") {
      forcedGreenAt[c.index] = c.letter;
    }
  }

  // Positions already pinned to a specific green letter (from real history
  // or a forced green) -- used for the (4) "only home left" inference.
  const greenAt = Array(5).fill(null);
  for (const past of history) {
    const pg = (past.guess || "").toUpperCase();
    const pfb = past.fb ?? past.fbGuesser;
    if (!Array.isArray(pfb)) continue;
    for (let i = 0; i < 5; i++) {
      if (pfb[i] === "🟩") greenAt[i] = pg[i];
    }
  }
  for (const idx in forcedGreenAt) greenAt[idx] = forcedGreenAt[idx];

  // Per-position set of letters the guesser knows are NOT there (a yellow
  // or a "present elsewhere" gray for that letter at that spot).
  const forbiddenAt = Array.from({ length: 5 }, () => new Set());
  for (const past of history) {
    const pg = (past.guess || "").toUpperCase();
    const pfb = past.fb ?? past.fbGuesser;
    if (!Array.isArray(pfb)) continue;
    const presentInGuess = new Set();
    for (let i = 0; i < 5; i++) {
      if (pfb[i] === "🟩" || pfb[i] === "🟨") presentInGuess.add(pg[i]);
    }
    for (let i = 0; i < 5; i++) {
      if (pfb[i] === "🟨") forbiddenAt[i].add(pg[i]);
      else if (pfb[i] === "⬛" && presentInGuess.has(pg[i])) forbiddenAt[i].add(pg[i]);
    }
  }

  const known = [false, false, false, false, false];

  for (let i = 0; i < 5; i++) {
    const letter = guess[i];

    // (2) globally-absent letter -> every occurrence is gray
    if (keyboard[letter] === "gray") { known[i] = true; continue; }

    // (3) force-revealed green at this exact spot
    if (forcedGreenAt[i] === letter) { known[i] = true; continue; }

    // (1) same letter, same position, seen before -> consistency locks it
    let seenHere = false;
    for (const past of history) {
      const pg = (past.guess || "").toUpperCase();
      const pfb = past.fb ?? past.fbGuesser;
      if (!Array.isArray(pfb)) continue;
      const c = pfb[i];
      if (pg[i] === letter && c && c !== "?" && c !== "❓") { seenHere = true; break; }
    }
    if (seenHere) { known[i] = true; continue; }

    // (4) inference: a present letter (green/yellow somewhere) whose every
    // OTHER slot is already taken by a different green or forbids it must
    // live here -> a true green here is deducible.
    if (trueFb[i] === "🟩" && (keyboard[letter] === "green" || keyboard[letter] === "yellow")) {
      let onlyHome = true;
      for (let j = 0; j < 5; j++) {
        if (j === i) continue;
        const takenByOther = greenAt[j] && greenAt[j] !== letter;
        const forbiddenHere = forbiddenAt[j].has(letter);
        if (!takenByOther && !forbiddenHere) { onlyHome = false; break; }
      }
      if (onlyHome) { known[i] = true; continue; }
    }
  }

  return known;
}

// Real feedback in, "real with some lies mixed in" out. Never touches a
// position the guesser could already deduce (computeKnownMask); flips a
// random 1..N of the rest to a genuinely different color so at least one
// tile always reads ambiguously.
function buildFakeFeedback(state, guess, trueFb) {
  const known = computeKnownMask(state, guess, trueFb);
  const fake = [...trueFb];

  const eligible = [];
  for (let i = 0; i < 5; i++) {
    if (known[i]) continue;
    if (!FAKEABLE.includes(trueFb[i])) continue;
    eligible.push(i);
  }

  // Every position was safely deducible -- most commonly an all-miss
  // guess, where every gray tile is trivially provable absent on its own.
  // Rather than let the power whiff and hand back the guesser's true
  // feedback completely untouched (a solid, non-animated row that reads
  // as "this did nothing"), still lie about exactly one tile so using the
  // power is always visible. A sharp guesser could in principle catch
  // this one lie by reasoning it out, but a fully truthful row defeats
  // the power outright.
  let pool = eligible;
  let forcedSingle = false;
  if (pool.length === 0) {
    pool = [0, 1, 2, 3, 4].filter(i => FAKEABLE.includes(trueFb[i]));
    forcedSingle = true;
  }
  if (pool.length === 0) return fake; // no ordinary-colored tile to lie about at all

  // Fisher-Yates shuffle, then lie about the first k.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const k = forcedSingle ? 1 : 1 + Math.floor(Math.random() * pool.length);
  for (let n = 0; n < k; n++) {
    const pos = pool[n];
    const others = FAKEABLE.filter(c => c !== trueFb[pos]);
    fake[pos] = others[Math.floor(Math.random() * others.length)];
  }

  return fake;
}

engine.registerPower("fakeFeedback", {
  apply(state, action, roomId, io) {
    if (state.powers.fakeFeedbackUsed) return false;
    state.powers.fakeFeedbackUsed = true;
    state.powers.fakeFeedbackActive = true;
    io.to(roomId).emit("powerUsed", { type: "fakeFeedback" });
  },

  postScore(state, entry) {
    if (!state.powers.fakeFeedbackActive) return;
    const guess = (state.pendingGuess || "").toUpperCase();
    // entry.fb is the real feedback finalizeFeedback just computed -- use it
    // directly ("use the existing feedback"), falling back to a fresh score
    // only if it's somehow missing.
    const entry1 = Array.isArray(entry.fb) ? [...entry.fb] : scoreGuess(state.secret, guess);
    const entry2 = buildFakeFeedback(state, guess, entry1);
    entry.fakeFeedback = {
      entry1, // the truth
      entry2  // the truth with 1..N unknown tiles recolored
    };
    entry.fbGuesser = ["?", "?", "?", "?", "?"];
  }
});
