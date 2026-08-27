// Regression test: Falsify Intel (fakeFeedback) is a one-shot power -- it
// should fake only the guesser's very next guess after the setter fires
// it, not every guess for the rest of the round. apply() used to set
// fakeFeedbackActive=true and nothing ever cleared it until round end
// (clearRoundPowerActivity, called from gameOver.js), so postScore kept
// faking every subsequent guess in the same round too.
const assert = require("assert");
const engine = require("../powers/powerEngineServer.js");
require("../powers/powers/fakeFeedbackServer.js");

function stubIo() {
  return { to: () => ({ emit: () => {} }) };
}

function makeState() {
  return {
    secret: "CRANE",
    pendingGuess: "SLATE",
    history: [],
    extraConstraints: [],
    powers: {
      fakeFeedbackUsed: false,
      fakeFeedbackActive: false
    }
  };
}

function run() {
  const power = engine.powers.fakeFeedback;
  const state = makeState();

  power.apply(state, {}, "room1", stubIo());
  assert.strictEqual(state.powers.fakeFeedbackUsed, true, "sanity: apply marks the power used");
  assert.strictEqual(state.powers.fakeFeedbackActive, true, "sanity: apply arms it for the next guess");

  // The guesser's very next guess -- this is the one the power should fake.
  const entry1 = { fb: ["🟩", "⬛", "🟨", "⬛", "⬛"] };
  power.postScore(state, entry1);

  assert.ok(entry1.fakeFeedback, "the armed guess gets a fakeFeedback payload");
  assert.deepStrictEqual(entry1.fbGuesser, ["?", "?", "?", "?", "?"], "the armed guess's guesser-facing feedback is hidden behind the two candidates");
  assert.strictEqual(state.powers.fakeFeedbackActive, false, "one-shot: disarms itself immediately after faking the armed guess");

  // A later guess in the SAME round -- must NOT get faked too.
  state.pendingGuess = "CRIME";
  const entry2 = { fb: ["🟩", "🟩", "🟩", "🟩", "🟩"] };
  power.postScore(state, entry2);

  assert.strictEqual(entry2.fakeFeedback, undefined, "a later guess in the same round is not faked");
  assert.strictEqual(entry2.fbGuesser, undefined, "a later guess's real feedback is left untouched");

  // fakeFeedbackUsed permanently blocks re-activating the power at all --
  // unrelated to the one-shot fix above, but worth pinning down here too.
  assert.strictEqual(power.apply(state, {}, "room1", stubIo()), false, "fakeFeedbackUsed blocks re-activation for the rest of the match");

  console.log("PASS fakeFeedbackOneShot: Falsify Intel fakes only the guess right after activation, not every later guess in the round");
}

module.exports = { run };

if (require.main === module) {
  run();
}
