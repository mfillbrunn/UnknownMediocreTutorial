// Feedback Lie falsifies exactly two randomly chosen tiles of the guesser's
// next result and leaves the other three truthful -- and never reveals which
// two: fbGuesser stays "❓" for the whole row, so the keyboard can't single
// out the lied letters either.
const assert = require("assert");
const engine = require("../powers/powerEngineServer.js");
require("../powers/powers/feedbackLieServer.js");
const { scoreGuess } = require("../game-engine/scoring");

function run() {
  const power = engine.powers.feedbackLie;
  const positionsSeen = new Set();

  for (let t = 0; t < 500; t++) {
    const state = {
      secret: "CRANE",
      pendingGuess: "CARES",
      history: [],
      powers: { feedbackLieUsed: false, feedbackLieActive: false }
    };
    power.apply(state, {}, "room", { to: () => ({ emit: () => {} }) });
    const fb = scoreGuess("CRANE", "CARES");
    const entry = { fb: [...fb], fbGuesser: [...fb] };
    power.postScore(state, entry);

    const lied = entry.feedbackLie.reduce((acc, color, i) => (color !== fb[i] ? acc.concat(i) : acc), []);
    assert.strictEqual(lied.length, 2, `exactly two tiles lie (got ${lied.length}: ${entry.feedbackLie.join("")} vs ${fb.join("")})`);
    lied.forEach(i => positionsSeen.add(i));

    assert.deepStrictEqual(entry.fbGuesser, ["❓", "❓", "❓", "❓", "❓"],
      "the whole row stays unknown to the guesser, so nothing points at the lied tiles");
    assert.deepStrictEqual(entry.fb, fb, "the real feedback is untouched");
    assert.strictEqual(state.powers.feedbackLieActive, false, "one-shot: disarms after the armed guess");
  }

  assert.strictEqual(positionsSeen.size, 5, "the lied tiles are random -- every position gets picked eventually");
  console.log("PASS feedbackLieTwoTiles: exactly two random tiles lie, the rest are true, and the guesser isn't told which");
}

module.exports = { run };

if (require.main === module) run();
