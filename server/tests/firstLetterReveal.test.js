// Regression test for the new First Letter Reveal guesser reward (Legendary
// tier): reveals the secret's first letter as a permanent GREEN
// extraConstraint at position 0, one-time per match, and must not be
// offered (or fire) once position 0 is already known green some other way.
const assert = require("assert");
const engine = require("../powers/powerEngineServer.js");
require("../powers/powers/firstLetterRevealServer.js");
const { guesserRewardPool } = require("../power-choice/powerChoiceServer");

function stubIo() {
  const emitted = [];
  return {
    emitted,
    to: () => ({
      emit(event, payload) {
        emitted.push({ event, payload });
      }
    })
  };
}

function makeState(overrides = {}) {
  return {
    secret: "CRANE",
    history: [],
    extraConstraints: [],
    powers: {},
    ...overrides
  };
}

function run() {
  // Fires once: grants a GREEN constraint at index 0 for the secret's
  // first letter, marks itself used, and stashes the letter for the
  // resolution log (see powerChoiceServer.js's detail.letter extraction).
  {
    const state = makeState();
    const io = stubIo();
    const result = engine.applyPower("firstLetterReveal", state, {}, "room-1", io);
    assert.notStrictEqual(result, false, "a fresh reveal should fire");
    assert.strictEqual(state.powers.firstLetterRevealUsed, true);
    assert.strictEqual(state.powers.firstLetterRevealedLetter, "C");
    assert.deepStrictEqual(
      state.extraConstraints,
      [{ type: "GREEN", index: 0, letter: "C" }],
      "grants exactly one permanent green constraint at position 1 (index 0)"
    );
  }

  // One-shot per match: a second call must not fire or duplicate the
  // constraint, even against a different secret.
  {
    const state = makeState({
      secret: "WHALE",
      powers: { firstLetterRevealUsed: true, firstLetterRevealedLetter: "C" },
      extraConstraints: [{ type: "GREEN", index: 0, letter: "C" }]
    });
    const result = engine.applyPower("firstLetterReveal", state, {}, "room-1", stubIo());
    assert.strictEqual(result, false, "already-used reveal must refuse to fire again");
    assert.strictEqual(state.extraConstraints.length, 1, "no duplicate constraint from a second attempt");
  }

  // Refuses to fire if position 0 is already known green from real play,
  // even if firstLetterRevealUsed itself was never set (belt-and-suspenders
  // against offering/using a redundant reveal).
  {
    const state = makeState({
      history: [{ guess: "CRISP", fb: ["🟩", "⬛", "⬛", "⬛", "⬛"] }]
    });
    const result = engine.applyPower("firstLetterReveal", state, {}, "room-1", stubIo());
    assert.strictEqual(result, false, "must not fire when position 0 is already known green from history");
    assert.strictEqual(state.extraConstraints.length, 0, "no constraint added when the reveal refused to fire");
  }

  // Pool membership: Legendary tier, and Stealth Guess (dropped from this
  // pool in favor of First Letter Reveal) is genuinely absent.
  {
    const pool = guesserRewardPool(3);
    const reveal = pool.find(option => option.powerId === "firstLetterReveal");
    assert.ok(reveal, "firstLetterReveal is offered in the guesser reward pool");
    assert.strictEqual(reveal.tier, 3, "firstLetterReveal is Legendary (tier 3)");
    assert.ok(
      !pool.some(option => option.powerId === "stealthGuess"),
      "stealthGuess must no longer be offered as a Power Choice reward"
    );
  }

  console.log("PASS firstLetterReveal: reveals the secret's first letter as a one-shot permanent green clue, refuses a redundant reveal, and is offered as a Legendary guesser reward in place of Stealth Guess");
}

module.exports = { run };

if (require.main === module) {
  run();
}
