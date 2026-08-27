// Regression test: Hard Mode quest compliance never tracked GRAY/ABSENT
// letters at all -- only green (locked positions) and yellow/mustInclude
// (letters that must be reused). That meant a guess reusing a letter
// already shown to be absent from the secret still counted as "hard-mode
// compliant" and could push the quest's progress toward ready, which is
// not what real Wordle hard mode allows (an absent letter must never be
// guessed again).
const assert = require("assert");
const questServer = require("../powers/powers/questServer");

function entry(guess, fb) {
  return { guess, fb, fbGuesser: [...fb] };
}

function run() {
  // ---- 1. isHardModeCompliant rejects a guess reusing a confirmed-absent
  // letter. ----
  {
    const green = [null, null, null, null, null];
    const mustInclude = new Map();
    const absent = new Set(["Z"]);

    assert.strictEqual(
      questServer.isHardModeCompliant("ZEBRA", green, mustInclude, absent),
      false,
      "reusing a confirmed-absent letter must not be hard-mode compliant"
    );
    assert.strictEqual(
      questServer.isHardModeCompliant("ROBIN", green, mustInclude, absent),
      true,
      "a guess with no absent letters must still be compliant"
    );
  }

  // ---- 2. computeHardModeCount excludes a guess that reuses a letter a
  // PRIOR guess already showed was absent. ----
  {
    const history = [
      // "Z" comes back gray -- confirmed absent.
      entry("ZEBRA", ["⬛", "⬛", "⬛", "⬛", "⬛"]),
      // Reuses "Z" -- must not count as compliant despite matching no
      // other constraint.
      entry("PIZZA", ["⬛", "⬛", "⬛", "⬛", "⬛"])
    ];

    assert.strictEqual(
      questServer.computeHardModeCount(history),
      1,
      "the guess (1) that first showed Z absent still counts, but the guess (2) reusing Z must not"
    );
  }

  // ---- 3. Duplicate-letter case: a letter grayed AND green/yellow in the
  // SAME guess is not treated as absent (only the excess copy grayed
  // out, not the letter itself). ----
  {
    // "P" is green at position 2 and gray at position 4 in the same
    // guess (secret has exactly one P, guess has two).
    const history = [
      entry("APPLX", ["⬛", "⬛", "🟩", "⬛", "⬛"])
    ];
    const { absent } = questServer.computeHardModeConstraints(history);
    assert.strictEqual(absent.has("P"), false, "a letter that was ALSO green/yellow in the same guess must not be marked absent");

    // A later guess reusing P (at the confirmed green position) must
    // still be allowed. Filler letters ("Q") deliberately avoid every
    // letter APPLX itself used, so only the P-duplicate case is being
    // tested here.
    const { green, mustInclude } = questServer.computeHardModeConstraints(history);
    assert.strictEqual(
      questServer.isHardModeCompliant("QQPQQ", green, mustInclude, absent),
      true,
      "P must still be usable at its confirmed green position"
    );
  }

  // ---- 4. A letter later required by green/mustInclude (e.g. after a
  // mid-round secret change) overrides an earlier absent mark instead of
  // permanently locking the quest out. ----
  {
    const history = [
      entry("ZEBRA", ["⬛", "⬛", "⬛", "⬛", "⬛"]), // Z absent (old secret)
      entry("BUZZY", ["⬛", "⬛", "🟩", "⬛", "⬛"])  // Z green now (new secret)
    ];
    const { green, mustInclude, absent } = questServer.computeHardModeConstraints(history);
    assert.strictEqual(absent.has("Z"), true, "Z is still recorded absent from the first guess");
    assert.strictEqual(
      questServer.isHardModeCompliant("XXZXX", green, mustInclude, absent),
      true,
      "a later green requirement for the same letter must win over an earlier absent mark"
    );
  }

  // ---- 5. evaluateQuestProgress's HARDMODE branch (the optimistic,
  // pre-scoring check used by onGuessSubmitted) also rejects a pending
  // guess that reuses an absent letter. Three fully-gray guesses, each a
  // single repeated letter, so exactly which letters end up absent (Z, Q,
  // X) stays unambiguous. ----
  {
    const state = {
      history: [
        entry("ZZZZZ", ["⬛", "⬛", "⬛", "⬛", "⬛"]),
        entry("QQQQQ", ["⬛", "⬛", "⬛", "⬛", "⬛"]),
        entry("XXXXX", ["⬛", "⬛", "⬛", "⬛", "⬛"])
      ]
    };
    const quest = { type: "HARDMODE" };

    const withAbsentLetter = questServer.evaluateQuestProgress(quest, state, "ZWWWW");
    assert.strictEqual(
      withAbsentLetter.ready,
      false,
      "a 4th guess reusing the confirmed-absent Z must not push the quest to ready"
    );

    const withoutAbsentLetter = questServer.evaluateQuestProgress(quest, state, "WWWWW");
    assert.strictEqual(
      withoutAbsentLetter.ready,
      true,
      "a 4th guess that avoids every absent letter must still push the quest to ready"
    );
  }

  console.log("PASS hardModeAbsentLetters: Hard Mode compliance now rejects a guess that reuses a letter already confirmed absent from the secret, while still tolerating the duplicate-letter and mid-round-secret-change edge cases");
}

module.exports = { run };

if (require.main === module) {
  run();
}
