// /powers/powers/fakeFeedbackServer.js — Falsify Intel (setter power)
//
// Shows the guesser TWO feedbacks for their guess (one true, one fake,
// alternating on the tiles) so they can't trust the reading. The fake is
// built directly from THIS guess's real feedback rather than by scoring an
// alternate secret: take the true feedback, work out which tiles the
// guesser could already contradict on their own, and recolor only the rest.
//
// The point is that NEITHER row may be obviously wrong. The truth never is,
// so all the work is in constraining the lie against what earlier rows
// already revealed. Per letter, measured against the guesser's existing
// knowledge:
//
//   * A letter proven ABSENT stays gray everywhere. It can't come back.
//   * A letter proven PRESENT (green or yellow somewhere, or blue under Blue
//     Mode) may show green or yellow, never gray -- it can move, not vanish.
//   * A letter proven GREEN at some position stays green at THAT position,
//     and shows yellow when guessed anywhere else -- unless the guesser has
//     already seen that letter present twice at once, in which case a second
//     green is fair game.
//
// On top of those, two positional locks:
//
//   1. Exact (position, letter) repeat. If an earlier guess placed this same
//      letter at this same position, secret consistency (enforced on every
//      secret submission via isConsistentWithHistory) forces the current
//      color there to match what it was then -- the guesser can derive it.
//      This also covers "was green here, must stay green here" and "was
//      yellow here, so it can't be green here".
//   2. A letter force-revealed green at this exact position by a power
//      (extraConstraints GREEN with a matching index).
//
// And one softer inference: a letter confirmed present whose only remaining
// possible home is this position (every other slot is taken by a different
// green or forbids this letter) must be green here. That one takes real
// reasoning to catch, so it's relaxed as a last resort (see the two-pass
// loop in buildFakeFeedback) rather than being allowed to leave the power
// with nothing to lie about.
//
// Left fakeable: a letter merely confirmed present somewhere but not pinned
// to a position -- the classic green-vs-yellow ambiguity this power exists
// to exploit -- and anything about a letter the guesser hasn't tried yet.
const engine = require("../powerEngineServer.js");
const { scoreGuess } = require("../../game-engine/scoring");
const { buildKeyboardState } = require("../../game-engine/keyboardState");

// The three ordinary feedback colors a fake tile is allowed to show. Blue
// (confuseColors) / purple (blindSpot) special tiles are never faked --
// they'd look broken -- so they're excluded here and skipped below.
const FAKEABLE = ["🟩", "🟨", "⬛"];
// Keyboard statuses that mean "this letter is in the secret". Blue is a real
// green or yellow hidden by Blue Mode, so it proves presence just as much.
const PRESENT = new Set(["green", "yellow", "blue"]);

function rowFeedback(entry) {
  const fb = entry && (entry.fb ?? entry.fbGuesser);
  return Array.isArray(fb) ? fb : null;
}

// Everything the guesser can hold against a fake tile, gathered once.
function computeKnowledge(state, guess) {
  const { keyboard } = buildKeyboardState(state);
  const history = Array.isArray(state.history) ? state.history : [];

  const forcedGreenAt = {};
  for (const c of state.extraConstraints ?? []) {
    if (c?.type === "GREEN" && typeof c.index === "number") {
      forcedGreenAt[c.index] = c.letter;
    }
  }

  // Positions pinned to a specific green letter, letters seen present twice
  // in a single row (so a second green for them is believable), and the
  // per-position sets of letters proven NOT to live there.
  const greenAt = Array(5).fill(null);
  const doubled = new Set();
  const forbiddenAt = Array.from({ length: 5 }, () => new Set());

  for (const past of history) {
    const pg = (past.guess || "").toUpperCase();
    const pfb = rowFeedback(past);
    if (!pfb) continue;

    const presentInGuess = new Set();
    const presentCount = {};
    for (let i = 0; i < 5; i++) {
      if (pfb[i] === "🟩" || pfb[i] === "🟨" || pfb[i] === "🟦") {
        presentInGuess.add(pg[i]);
        presentCount[pg[i]] = (presentCount[pg[i]] || 0) + 1;
      }
      if (pfb[i] === "🟩") greenAt[i] = pg[i];
    }
    for (const letter of Object.keys(presentCount)) {
      if (presentCount[letter] >= 2) doubled.add(letter);
    }
    for (let i = 0; i < 5; i++) {
      if (pfb[i] === "🟨") forbiddenAt[i].add(pg[i]);
      else if (pfb[i] === "⬛" && presentInGuess.has(pg[i])) forbiddenAt[i].add(pg[i]);
    }
  }
  for (const idx in forcedGreenAt) greenAt[idx] = forcedGreenAt[idx];

  // (1) this exact letter was already tried at this exact position
  const seenHere = [false, false, false, false, false];
  for (let i = 0; i < 5; i++) {
    for (const past of history) {
      const pg = (past.guess || "").toUpperCase();
      const pfb = rowFeedback(past);
      if (!pfb) continue;
      const c = pfb[i];
      if (pg[i] === guess[i] && c && c !== "?" && c !== "❓") { seenHere[i] = true; break; }
    }
  }

  return { keyboard, forcedGreenAt, greenAt, doubled, forbiddenAt, seenHere };
}

// The colors position i may show INSTEAD of its true one. `greenNow` is the
// running picture of which letter sits green where -- history's greens plus
// whatever the fake row has already committed to -- so two fake greens never
// invent a double letter between them.
function lieOptions(i, guess, trueFb, knowledge, greenNow, strict) {
  const trueColor = trueFb[i];
  if (!FAKEABLE.includes(trueColor)) return [];

  const letter = guess[i];
  const { keyboard, forcedGreenAt, doubled, seenHere } = knowledge;

  if (keyboard[letter] === "gray") return [];        // proven absent: stays gray
  if (forcedGreenAt[i] === letter) return [];        // power-revealed green
  if (seenHere[i]) return [];                        // consistency pins this tile
  if (strict && knowledge.onlyHome[i]) return [];    // inference: must live here

  let options = FAKEABLE.filter(color => color !== trueColor);

  // A letter the guesser has proven is in the secret can move, but it can't
  // disappear.
  if (PRESENT.has(keyboard[letter])) {
    options = options.filter(color => color !== "⬛");
  }

  // Green claims are the easiest lie to catch, so they get the strictest
  // reading -- and one this pass never relaxes. This slot can't turn green if
  // the guesser has already watched a DIFFERENT letter land green here, and
  // this letter can't turn green here while it sits green somewhere else,
  // unless the guesser has seen it appear twice at once.
  const pinnedHere = greenNow[i];
  const pinnedElsewhere = greenNow.some((g, j) => j !== i && g === letter);
  if ((pinnedHere && pinnedHere !== letter) || (pinnedElsewhere && !doubled.has(letter))) {
    options = options.filter(color => color !== "🟩");
  }

  return options;
}

// Real feedback in, "real with some lies mixed in" out. Flips a random 1..N
// of the fakeable positions to a genuinely different color so at least one
// tile always reads ambiguously.
function buildFakeFeedback(state, guess, trueFb) {
  const knowledge = computeKnowledge(state, guess);

  // The soft inference: a present letter whose every OTHER slot is already
  // taken by a different green or forbids it must live here, so a true green
  // there is deducible.
  knowledge.onlyHome = [0, 1, 2, 3, 4].map(i => {
    const letter = guess[i];
    if (trueFb[i] !== "🟩") return false;
    if (!PRESENT.has(knowledge.keyboard[letter])) return false;
    for (let j = 0; j < 5; j++) {
      if (j === i) continue;
      const takenByOther = knowledge.greenAt[j] && knowledge.greenAt[j] !== letter;
      if (!takenByOther && !knowledge.forbiddenAt[j].has(letter)) return false;
    }
    return true;
  });

  const fake = [...trueFb];
  // Greens the guesser will be looking at: history's pins, plus this row's
  // own greens as they stand.
  const greenNow = knowledge.greenAt.slice();
  for (let i = 0; i < 5; i++) if (fake[i] === "🟩") greenNow[i] = guess[i];

  // Pass 1 honors every rule above. If that leaves nothing to lie about, pass
  // 2 relaxes the one inference-only rule (`onlyHome`) for a single tile -- a
  // sharp guesser could reason that one out, but handing back a completely
  // truthful row makes the power read as broken. The color rules themselves
  // are never relaxed.
  for (const strict of [true, false]) {
    const pool = [0, 1, 2, 3, 4]
      .filter(i => lieOptions(i, guess, trueFb, knowledge, greenNow, strict).length > 0);
    if (pool.length === 0) continue;

    // Fisher-Yates shuffle, then lie about the first k.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const target = strict ? 1 + Math.floor(Math.random() * pool.length) : 1;
    let told = 0;
    for (const pos of pool) {
      if (told >= target) break;
      // Recomputed per tile: an earlier lie in this same row can have moved
      // a green and closed off an option here.
      const options = lieOptions(pos, guess, trueFb, knowledge, greenNow, strict);
      if (options.length === 0) continue;
      fake[pos] = options[Math.floor(Math.random() * options.length)];
      greenNow[pos] = fake[pos] === "🟩" ? guess[pos] : knowledge.greenAt[pos];
      told += 1;
    }
    if (told > 0) return fake;
  }

  // Nothing could be recolored without contradicting a row the guesser has
  // already seen. The truth twice over is the honest failure mode here.
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
    // One-shot per activation: this is the guesser's NEXT guess after the
    // setter fired the power, not every guess for the rest of the round --
    // fakeFeedbackUsed already blocks re-activating it, but without this
    // the guesser's every following guess this round would keep getting
    // faked too.
    state.powers.fakeFeedbackActive = false;
    const guess = (state.pendingGuess || "").toUpperCase();
    // entry.fb is the real feedback finalizeFeedback just computed -- use it
    // directly ("use the existing feedback"), falling back to a fresh score
    // only if it's somehow missing.
    const entry1 = Array.isArray(entry.fb) ? [...entry.fb] : scoreGuess(state.secret, guess);
    const entry2 = buildFakeFeedback(state, guess, entry1);
    entry.fakeFeedback = {
      entry1, // the truth
      entry2  // the truth with 1..N deniable tiles recolored
    };
    entry.fbGuesser = ["?", "?", "?", "?", "?"];
  }
});
