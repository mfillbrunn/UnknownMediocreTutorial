// Regression test: a single-player power's guesser-facing mask must survive
// the campaign feedback-transform hook.
//
// finalizeFeedback runs powerEngine.postScore (where a setter power masks
// what the guesser is shown -- Count Only's and Feedback Lie's "❓", Blue
// Mode's blue tiles, Fake Feedback's decoy) and THEN calls
// singlePlayerHooks.maybeTransformFeedback for campaign stage rules.
//
// That hook used to write `entry.fbGuesser = [...transformed]`
// unconditionally. registry.js's runHook SEEDS transformFeedback with
// ctx.fb and returns that same array back when no rule changes it -- and a
// stage with no transformFeedback rules at all, which is every Challenge
// stage, always lands there. So the hook overwrote the guesser's copy with
// the true colors on every scored row of every single-player match,
// undoing the mask the power had applied microseconds earlier. Every
// masking Challenge (Count Only, Blue Mode, Feedback Lie, Fake Feedback)
// looked like its power never fired at all.
//
// The hook must now only touch the entry when a rule genuinely changed the
// feedback, and even then must leave an already-masked guesser copy alone.
const assert = require("assert");
const hooks = require("../single-player/hooks");

function campaignState(rules) {
  return {
    singlePlayer: {
      enabled: true,
      humanUserId: "human",
      stage: { game: { rules: rules || [] } }
    }
  };
}

function entryWith(fb, fbGuesser) {
  return { guess: "CRANE", fb: [...fb], fbGuesser: fbGuesser ? [...fbGuesser] : [...fb] };
}

const TRUE_FB = ["🟩", "🟨", "⬛", "⬛", "🟨"];
const MASK = ["❓", "❓", "❓", "❓", "❓"];

function run() {
  // -- 1. No stage rules (every Challenge stage): a power's mask survives. --
  {
    const state = campaignState([]);
    const entry = entryWith(TRUE_FB, MASK);
    hooks.maybeTransformFeedback(state, entry, "human");
    assert.deepStrictEqual(
      entry.fbGuesser,
      MASK,
      "a power's guesser-facing mask must survive a stage with no transformFeedback rules"
    );
    assert.deepStrictEqual(entry.fb, TRUE_FB, "the setter's own copy stays the real feedback");
  }

  // -- 2. Same, for the other mask shapes the powers use. --
  {
    for (const mask of [["🟦", "🟦", "⬛", "⬛", "🟦"], ["?", "?", "?", "?", "?"]]) {
      const state = campaignState([]);
      const entry = entryWith(TRUE_FB, mask);
      hooks.maybeTransformFeedback(state, entry, "human");
      assert.deepStrictEqual(entry.fbGuesser, mask, `mask ${mask.join("")} must survive`);
    }
  }

  // -- 3. An unmasked row is left exactly as it was, not rebuilt. --
  {
    const state = campaignState([]);
    const entry = entryWith(TRUE_FB);
    const sameArrayBefore = entry.fbGuesser;
    hooks.maybeTransformFeedback(state, entry, "human");
    assert.deepStrictEqual(entry.fbGuesser, TRUE_FB, "an unmasked row keeps the real feedback");
    assert.strictEqual(
      entry.fbGuesser,
      sameArrayBefore,
      "with nothing to transform the hook must not even replace the array"
    );
  }

  // -- 4. A rule that DOES upgrade a tile still applies, and still mirrors
  // onto an unmasked guesser copy (the shipped yellowToGreen assist). --
  {
    // yellowToGreen with target "both" turns every 🟨 into 🟩.
    const state = campaignState([{ id: "yellowToGreen", params: { target: "both" } }]);
    const upgraded = ["🟩", "🟩", "⬛", "⬛", "🟩"];

    const entry = entryWith(TRUE_FB);
    hooks.maybeTransformFeedback(state, entry, "human");
    assert.deepStrictEqual(entry.fb, upgraded, "a real rule upgrade must reach entry.fb");
    assert.deepStrictEqual(
      entry.fbGuesser,
      upgraded,
      "an unmasked guesser copy still mirrors a genuine rule upgrade"
    );

    // -- 5. ...but that same upgrade must NOT strip a power's mask, or the
    // guesser would be handed exactly what the power was hiding. --
    const masked = entryWith(TRUE_FB, MASK);
    hooks.maybeTransformFeedback(state, masked, "human");
    assert.deepStrictEqual(masked.fb, upgraded, "the setter's copy still takes the upgrade");
    assert.deepStrictEqual(
      masked.fbGuesser,
      MASK,
      "a rule upgrade must not overwrite a power's mask on the guesser's copy"
    );
  }

  // -- 6. Outside single-player the hook stays a no-op. --
  {
    const entry = entryWith(TRUE_FB, MASK);
    hooks.maybeTransformFeedback({}, entry, "human");
    assert.deepStrictEqual(entry.fbGuesser, MASK, "no campaign state -> untouched");
  }

  console.log(
    "PASS challengePowerMaskSurvives: the campaign feedback-transform hook no longer overwrites a power's guesser-facing mask (Count Only / Blue Mode / Feedback Lie / Fake Feedback now actually apply in Challenges), while a genuine stage-rule upgrade still works"
  );
}

module.exports = { run };

if (require.main === module) {
  run();
}
