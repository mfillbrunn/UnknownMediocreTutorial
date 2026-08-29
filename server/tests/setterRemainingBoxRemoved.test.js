// Regression test: the Secretkeeper's "Keep -> New" remaining-word-count
// comparison has been removed from the setter screen by request -- the
// setter must never receive that numeric hint again, in any phase or
// state shape, while the Guesser's own remaining-secrets box (Wiretap)
// stays completely unaffected.
const assert = require("assert");
const { buildSetterRemainingBoxState, buildGuesserRemainingBoxState } = require("../utils/remainingWords");

const SECRETS = ["CRANE", "SLATE", "STARE", "TRACE", "GRAPE"];

function run() {
  const baseState = {
    phase: "normal",
    gameOver: false,
    setter: "p1",
    guesser: "p2",
    pendingGuess: "CRANE",
    history: [
      { guess: "STARE", fb: ["⬛", "⬛", "⬛", "⬛", "⬛"], fbGuesser: ["⬛", "⬛", "⬛", "⬛", "⬛"] }
    ],
    powers: {},
    extraConstraints: []
  };

  // Every phase/state shape that used to produce a real Keep/New
  // comparison must now come back { visible: false } -- normal play, the
  // simultaneous round-start "empty" placeholder, and the stealth-hidden
  // "?" case.
  const cases = [
    { ...baseState, phase: "normal" },
    { ...baseState, phase: "simultaneous", history: [] },
    { ...baseState, powers: { stealthGuessActive: true } },
    { ...baseState, gameOver: true },
    { ...baseState, phase: "lobby" }
  ];

  for (const state of cases) {
    const boxState = buildSetterRemainingBoxState(state, "p1", SECRETS, "SLATE");
    assert.deepStrictEqual(
      boxState,
      { visible: false },
      `buildSetterRemainingBoxState must always return {visible:false} (phase=${state.phase}, gameOver=${state.gameOver})`
    );
    assert.ok(!("old" in boxState), "the response must not carry an 'old' field at all");
    assert.ok(!("new" in boxState), "the response must not carry a 'new' field at all");
    assert.ok(!("isConsistent" in boxState), "the response must not carry an 'isConsistent' field at all");
  }

  // A viewer who ISN'T the setter must also get {visible:false} (this was
  // already true before, still true now).
  assert.deepStrictEqual(
    buildSetterRemainingBoxState(baseState, "p2", SECRETS, "SLATE"),
    { visible: false },
    "a non-setter viewer must get {visible:false}"
  );

  // The Guesser's own remaining-secrets box (Wiretap) must be completely
  // unaffected -- it's a different feature on a different screen.
  const guesserBox = buildGuesserRemainingBoxState(baseState, SECRETS);
  assert.strictEqual(guesserBox.visible, true, "the guesser's remaining-secrets box must still work");
  assert.strictEqual(typeof guesserBox.current, "number", "the guesser's box must still report a real count");

  console.log("PASS setterRemainingBoxRemoved: the setter's Keep->New comparison is gone in every phase/state, the guesser's own box is unaffected");
}

module.exports = { run };

if (require.main === module) {
  run();
}
