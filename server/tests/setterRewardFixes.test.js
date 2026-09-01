// Regression test: two fixes to the Secretkeeper's Power Choice reward
// pool.
//
// 1. "Trade a Green" used to add the new green BEFORE erasing the 3
//    yellows it costs. If the randomly-picked green's letter also
//    happened to be one of those 3 yellows (a very real possibility --
//    the yellow-erase pool and the green-add pool aren't disjoint), the
//    subsequent erase would wipe the green right back out, since
//    eraseLetterKnowledge clears EVERY constraint type for a letter (see
//    resetLetterKnowledge.js), not just yellow ones. Erasing first, then
//    adding the green, makes that impossible -- the green is added to a
//    letter whose yellow info (if any) is already gone.
//
// 2. Two new Secretkeeper rewards: "Erase a Yellow" (Common, erases one
//    random yellow letter) and "Refresh the Row" (Legendary, erases
//    every green+yellow letter on whichever QWERTY row currently holds
//    the most of them).
const assert = require("assert");
const { applyChoice, setterRewardPool } = require("../power-choice/powerChoiceServer");

function option(id) {
  const found = setterRewardPool().find(o => o.id === id);
  if (!found) throw new Error(`no setter reward option with id ${id}`);
  return found;
}

function baseState(overrides = {}) {
  return {
    setter: "S",
    guesser: "G",
    turn: "G",
    phase: "normal",
    secret: "CRANE",
    pendingGuess: "",
    guessCount: 1,
    history: [],
    extraConstraints: [],
    powers: {},
    powerChoice: {},
    activePowers: [],
    ...overrides
  };
}

function makeContext() {
  return { io: { to: () => ({ emit: () => {} }) } };
}

function applySetterReward(id, state) {
  const { io } = makeContext();
  const choice = { ownerUserId: "S", role: "setter", threshold: 4, tier: option(id).tier };
  const applied = applyChoice(state, option(id), choice, {}, "room1", io, {}, {});
  assert.strictEqual(applied, true, `applyChoice must succeed for ${id}`);
  return state.powerChoice.lastResolution;
}

function run() {
  // -- 1. Trade a Green: the just-granted green must survive even when
  // its letter is ALSO one of the 3 yellows this same reward erases. --
  {
    // CRANE, positions 0-3 (C,R,A,N) already green -- E at index 4 is the
    // ONLY letter addGreen can possibly pick. E also comes back yellow in
    // an earlier guess (EAGLE has E at index 0, not 4) alongside two other
    // yellow letters (G, H) with no other yellow candidates -- so all 3
    // of "erase 3 yellows" are forced to be exactly {E, G, H}, and E is
    // guaranteed to be both the green AND one of the erased yellows.
    const state = baseState({
      extraConstraints: [
        { type: "GREEN", index: 0, letter: "C" },
        { type: "GREEN", index: 1, letter: "R" },
        { type: "GREEN", index: 2, letter: "A" },
        { type: "GREEN", index: 3, letter: "N" },
        { type: "YELLOW", letter: "G" },
        { type: "YELLOW", letter: "H" }
      ],
      history: [
        { guess: "EAGLE", fb: ["🟨", "⬛", "⬛", "⬛", "⬛"], fbGuesser: ["🟨", "⬛", "⬛", "⬛", "⬛"] }
      ]
    });

    const resolution = applySetterReward("spy-trade-green", state);
    assert.deepStrictEqual(resolution.detail.green, { index: 4, letter: "E" }, "the only possible green is E at index 4");
    assert.deepStrictEqual(
      new Set(resolution.detail.erasedYellows.map(y => y.letter)),
      new Set(["E", "G", "H"]),
      "all 3 available yellow letters (including E) must be the ones erased"
    );

    const greenSurvived = state.extraConstraints.some(
      c => c.type === "GREEN" && c.index === 4 && c.letter === "E"
    );
    assert.ok(greenSurvived, "the newly granted green at index 4 must still be present after the yellow erase, not wiped out by it");

    const yellowGone = state.extraConstraints.some(c => c.type === "YELLOW");
    assert.strictEqual(yellowGone, false, "every yellow constraint (G, H, and E's old one) must be erased");

    const historyStillYellow = state.history[0].fb[0] === "🟨" || state.history[0].fbGuesser[0] === "🟨";
    assert.strictEqual(historyStillYellow, false, "E's yellow history tile must be erased too");
  }

  // -- 2. Erase a Yellow: erases exactly one yellow letter, leaves others --
  {
    const state = baseState({
      extraConstraints: [
        { type: "YELLOW", letter: "G" },
        { type: "YELLOW", letter: "H" }
      ]
    });
    const resolution = applySetterReward("spy-erase-yellow-1", state);
    assert.strictEqual(resolution.detail.letters.length, 1, "exactly one yellow letter must be erased");
    const remainingYellows = state.extraConstraints.filter(c => c.type === "YELLOW");
    assert.strictEqual(remainingYellows.length, 1, "the OTHER yellow letter must be left untouched");
  }

  // -- 3. Refresh the Row: picks the row with the most known letters and
  // erases every one of them, leaving other rows' letters alone. --
  {
    // Q/W/E/R/T are all top-row (QWERTYUIOP); A is home-row (ASDFGHJKL).
    // Top row has 5 known letters, home row has only 1 -- top row must win.
    const state = baseState({
      secret: "QUERY", // contains Q, U, E, R, Y -- all on the top row
      extraConstraints: [
        { type: "GREEN", index: 0, letter: "Q" },
        { type: "GREEN", index: 2, letter: "E" },
        { type: "YELLOW", letter: "R" },
        { type: "YELLOW", letter: "T" },
        { type: "YELLOW", letter: "W" },
        { type: "YELLOW", letter: "A" } // home row -- must survive
      ]
    });
    const resolution = applySetterReward("spy-erase-row", state);
    assert.strictEqual(resolution.detail.row, "QWERTYUIOP", "the top row has the most known letters (5) and must be the one picked");
    assert.deepStrictEqual(
      new Set(resolution.detail.letters),
      new Set(["Q", "E", "R", "T", "W"]),
      "every known top-row letter must be the ones erased"
    );

    const topRowConstraintsLeft = state.extraConstraints.filter(c =>
      "QWERTYUIOP".includes(c.letter)
    );
    assert.strictEqual(topRowConstraintsLeft.length, 0, "no top-row constraint may remain");

    const homeRowSurvived = state.extraConstraints.some(c => c.type === "YELLOW" && c.letter === "A");
    assert.ok(homeRowSurvived, "the home-row letter (A) must be untouched -- only the winning row is erased");
  }

  console.log("PASS setterRewardFixes: Trade a Green erases its 3 yellows before granting the green (so the green can never be wiped by its own reward), Erase a Yellow and Refresh the Row both work correctly");
}

module.exports = { run };

if (require.main === module) {
  run();
}
