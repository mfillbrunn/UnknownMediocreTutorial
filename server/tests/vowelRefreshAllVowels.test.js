// Regression test: Vowel Refresh must erase EVERY vowel's accumulated
// knowledge -- from ANY guess in history, not just the most recent one --
// and the Power Choice reward-offer eligibility check must agree that the
// card is worth offering whenever that's true, not just when the last
// guess happens to contain a vowel.
//
// vowelRefreshServer.js's apply() was fixed to always reset all 5 vowels
// across the whole match, but two other places still described (and, for
// the eligibility check, enforced) the old "only the last guess" rule:
// public/powerEngine/powers/vowelRefresh.js's client-side preview/shine
// (fixed alongside this test -- not exercised here since it's a browser
// file) and this module's own powerOptionApplicable "vowelRefresh" case,
// fixed below.
const assert = require("assert");
require("../powers/powers/vowelRefreshServer");
const engine = require("../powers/powerEngineServer");
const { eraseLetterKnowledge } = require("../utils/resetLetterKnowledge");
const { optionApplicable, powerOption } = require("../power-choice/powerChoiceServer");

global.ALLOWED_SECRETS = ["CRANE", "SLATE", "STARE", "TRACE", "GRAPE"];

function baseState() {
  return {
    setter: "p1",
    guesser: "p2",
    turn: "p1",
    phase: "normal",
    // Vowel info spread across TWO guesses -- the bug this regresses only
    // ever showed up once there was at least one earlier guess whose
    // vowel info the "last guess only" logic would ignore.
    history: [
      { guess: "ERASE", fb: ["🟨", "⬛", "🟩", "⬛", "🟨"] }, // E, A, E all carry real feedback
      { guess: "CRYPT", fb: ["⬛", "⬛", "⬛", "⬛", "⬛"] }   // most recent guess: no vowel at all
    ],
    extraConstraints: [
      { type: "GREEN", index: 2, letter: "A" },
      { type: "YELLOW", letter: "I" },
      { type: "ABSENT", letter: "U" }
    ],
    powers: {},
    powerChoice: null
  };
}

function run() {
  // -- 1. eraseLetterKnowledge/apply() clears every vowel everywhere,
  // including ones whose only real feedback sits in an EARLIER guess than
  // the most recent one. --
  {
    const state = baseState();
    const io = { to: () => ({ emit: () => {} }) };
    const result = engine.applyPower("vowelRefresh", state, { userId: "p1" }, "room1", io, {});
    assert.notStrictEqual(result, false, "apply() must actually run given a non-empty history");

    for (const entry of state.history) {
      for (let i = 0; i < 5; i++) {
        const letter = entry.guess[i];
        if ("AEIOU".includes(letter)) {
          assert.strictEqual(
            entry.fb[i],
            "",
            `${letter} at ${entry.guess}[${i}] must be erased, including in a guess that isn't the most recent`
          );
        }
      }
    }

    assert.deepStrictEqual(
      state.extraConstraints,
      [],
      "every GREEN/YELLOW/ABSENT extraConstraint naming a vowel must be removed"
    );
  }

  // -- 2. The reward-offer eligibility check must also look at the WHOLE
  // history, not just the last guess -- a state whose only vowel info is
  // in an earlier row must still offer the card. --
  {
    const state = baseState();
    const applicable = optionApplicable(state, powerOption("vowelRefresh"));
    assert.strictEqual(
      applicable,
      true,
      "vowelRefresh must be offered when vowel info exists in an earlier guess, even if the last guess has no vowels"
    );
  }

  // -- 3. A state with genuinely no vowel info anywhere (fresh match, no
  // guesses) must NOT offer the card -- it would be a real no-op. --
  {
    const state = baseState();
    state.history = [];
    state.extraConstraints = [];
    const applicable = optionApplicable(state, powerOption("vowelRefresh"));
    assert.strictEqual(
      applicable,
      false,
      "vowelRefresh must not be offered when there is no vowel knowledge to erase"
    );
  }

  console.log("PASS vowelRefreshAllVowels: Vowel Refresh clears every vowel across the whole match, and reward eligibility agrees");
}

module.exports = { run };

if (require.main === module) {
  run();
}
