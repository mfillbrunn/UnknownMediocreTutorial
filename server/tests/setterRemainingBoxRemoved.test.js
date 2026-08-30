// Regression test: the Secretkeeper's "Keep -> New" candidate-count
// comparison has been removed from the setter screen by request -- the
// box itself must never show that numeric hint again, in any phase or
// state shape. Its coverStrength payload (the separate 1-3 star
// draft-quality rating, tied into the Spy Charge system) must still come
// through untouched, since that's a different feature that was never
// meant to disappear along with the numbers -- and the Guesser's own
// remaining-secrets box (Wiretap) stays completely unaffected either way.
const assert = require("assert");
const { buildSetterRemainingBoxState, buildGuesserRemainingBoxState } = require("../utils/remainingWords");

const SECRETS = ["CRANE", "SLATE", "STARE", "TRACE", "GRAPE"];

function run() {
  const baseState = {
    phase: "normal",
    gameOver: false,
    setter: "p1",
    guesser: "p2",
    turn: "p1",
    secret: "SLATE",
    pendingGuess: "CRANE",
    history: [],
    powers: {},
    extraConstraints: []
  };

  // Every phase/state shape that used to produce a real Keep/New
  // comparison must now come back visible:false with no numeric fields --
  // normal play, the simultaneous round-start case, the stealth-hidden
  // case, game over, and the lobby.
  const cases = [
    { ...baseState, phase: "normal" },
    { ...baseState, phase: "simultaneous" },
    { ...baseState, powers: { stealthGuessActive: true } },
    { ...baseState, gameOver: true },
    { ...baseState, phase: "lobby" }
  ];

  for (const state of cases) {
    const boxState = buildSetterRemainingBoxState(state, "p1", SECRETS, "SLATE");
    assert.strictEqual(
      boxState.visible,
      false,
      `buildSetterRemainingBoxState must always report visible:false (phase=${state.phase}, gameOver=${state.gameOver})`
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

  // The star rating itself must survive: a real in-progress setter turn
  // with a valid draft still comes back with a visible, star-rated
  // coverStrength payload -- this is the exact pipeline
  // ui/setter-board.js's renderCoverStars reads to show (and, per the
  // "make the stars dance" request, animate) the 1-3 star draft rating.
  const normalBox = buildSetterRemainingBoxState(baseState, "p1", SECRETS, "TRACE");
  assert.strictEqual(normalBox.visible, false, "the box itself stays hidden");
  assert.ok(normalBox.coverStrength, "coverStrength must still be computed and returned");
  assert.strictEqual(normalBox.coverStrength.visible, true, "the star rating must still be visible for a live setter turn");
  assert.strictEqual(typeof normalBox.coverStrength.stars, "number", "the star rating must still report a real star count");

  // The Guesser's own remaining-secrets box (Wiretap) must be completely
  // unaffected -- it's a different feature on a different screen.
  const guesserBox = buildGuesserRemainingBoxState(baseState, SECRETS);
  assert.strictEqual(guesserBox.visible, true, "the guesser's remaining-secrets box must still work");
  assert.strictEqual(typeof guesserBox.current, "number", "the guesser's box must still report a real count");

  console.log("PASS setterRemainingBoxRemoved: the setter's Keep->New comparison stays gone in every phase/state, the star rating and the guesser's own box both still work");
}

module.exports = { run };

if (require.main === module) {
  run();
}
