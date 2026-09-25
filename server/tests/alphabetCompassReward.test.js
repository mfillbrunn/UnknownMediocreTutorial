// Alphabet Compass (Rare guesser Power Choice reward): for the one turn it
// is used, every earlier row reads ← / → / green against the CURRENT
// secret instead of its colors, and it switches off when the guesser
// submits.
const assert = require("assert");
const engine = require("../powers/powerEngineServer.js");
const { compassReading } = require("../powers/powers/alphabetCompassServer.js");
const { guesserRewardPool, optionApplicable } = require("../power-choice/powerChoiceServer");
const { clearRoundState } = require("../core/transitions/normalTransitions");
const { clearRoundPowerActivity } = require("../utils/clearRoundPowerActivity");
const { buildSafeStateForPlayer } = require("../utils/safeState");

const io = { to: () => ({ emit: () => {} }) };

function makeState(overrides = {}) {
  return {
    secret: "CRANE",
    phase: "normal",
    guesser: "g1",
    setter: "s1",
    turn: "g1",
    players: { g1: { role: "guesser" }, s1: { role: "setter" } },
    timeControl: { mode: "none" },
    activePowers: [],
    history: [
      { guess: "FREAK", fb: [], fbGuesser: [] },
      { guess: "CLAMP", fb: [], fbGuesser: [] }
    ],
    powers: {},
    ...overrides
  };
}

function run() {
  // Each tile points toward the secret's letter in that same spot.
  {
    // CRANE vs FREAK: C<F ←, R=R green, A<E ←, N>A →, E<K ←.
    assert.deepStrictEqual(compassReading("CRANE", "FREAK"), ["L", "G", "L", "R", "L"]);
    assert.deepStrictEqual(compassReading("crane", "crane"), ["G", "G", "G", "G", "G"], "case-insensitive; a solve is all green");
    assert.deepStrictEqual(compassReading("ZZZZZ", "AAAAA"), ["R", "R", "R", "R", "R"]);
  }

  // Applying reads every earlier row against the current secret.
  {
    const state = makeState();
    const result = engine.powers.alphabetCompass.apply(state, {}, "room-1", io);
    assert.notStrictEqual(result, false, "applies with rows on the board");
    assert.strictEqual(state.powers.alphabetCompassActive, true);
    assert.deepStrictEqual(state.powers.alphabetCompassRows, [
      ["L", "G", "L", "R", "L"],
      ["G", "R", "G", "R", "L"]
    ]);
    assert.strictEqual(engine.powers.alphabetCompass.apply(state, {}, "room-1", io), false, "one use per round");
  }

  // Needs a row to read; offered only then.
  {
    const empty = makeState({ history: [] });
    assert.strictEqual(engine.powers.alphabetCompass.apply(empty, {}, "room-1", io), false);
    const option = guesserRewardPool(1).find(entry => entry.powerId === "alphabetCompass");
    assert.strictEqual(optionApplicable(makeState({ history: [] }), option), false, "not offered on an empty board");
    assert.strictEqual(optionApplicable(makeState(), option), true, "offered once a guess is on the board");
    assert.strictEqual(optionApplicable(makeState({ powers: { alphabetCompassUsed: true } }), option), false, "not offered after use");
  }

  // One turn only: the guesser's submit switches it off.
  {
    const state = makeState();
    engine.powers.alphabetCompass.apply(state, {}, "room-1", io);
    clearRoundState(state, "guesser");
    assert.strictEqual(state.powers.alphabetCompassActive, false);
    assert.strictEqual(state.powers.alphabetCompassRows, null);

    const roundEnd = makeState({ powers: { alphabetCompassActive: true, alphabetCompassRows: [["G"]] } });
    clearRoundPowerActivity(roundEnd);
    assert.strictEqual(roundEnd.powers.alphabetCompassActive, false);
    assert.strictEqual(roundEnd.powers.alphabetCompassRows, null);
  }

  // Readings come from the secret, so only the guesser receives them.
  {
    const state = makeState({ powers: { alphabetCompassActive: true, alphabetCompassRows: [["L", "G", "L", "R", "L"]] } });
    assert.deepStrictEqual(buildSafeStateForPlayer(state, "g1", []).powers.alphabetCompassRows, [["L", "G", "L", "R", "L"]]);
    assert.strictEqual(buildSafeStateForPlayer(state, "s1", []).powers.alphabetCompassRows, undefined);
  }

  // A Rare guesser reward at every quest milestone, described as one turn.
  {
    for (const tier of [1, 2, 3]) {
      const option = guesserRewardPool(tier).find(entry => entry.powerId === "alphabetCompass");
      assert.ok(option, `offered at tier ${tier}`);
      assert.strictEqual(option.tier, 2, "Rare (tier 2)");
      assert.strictEqual(option.category, "information");
      assert.ok(/this turn/i.test(option.description), "the card reads as a one-turn effect");
    }
  }

  console.log("PASS alphabetCompassReward: every earlier row reads ←/→/green against the current secret for one turn, clears on submit, stays private to the guesser, and is a Rare guesser reward");
}

module.exports = { run };

if (require.main === module) {
  run();
}
