// Regression test: the AI Secretkeeper ranks candidates by what the
// guesser can see, but a masking power (Count Only's ❓ tiles, Fake
// Feedback, Feedback Lie...) makes that view looser than the real
// feedback. checkSecret enforces the REAL feedback, so every secret the
// AI proposes has to satisfy it -- a pick that only matched the guesser's
// view was rejected, and the AI sat on its turn until a retry happened to
// keep its word.
const assert = require("assert");
const { createAI } = require("../core/ai/genericAI");
const { checkSecret } = require("../game-engine/validation");

const SETTER_PARAMS = {
  maxSecretChanges: 99,
  maxSecretsEvaluated: 60,
  randomness: 0,
  pOverlap: 0.5,
  pReductionGivenNoOverlap: 0.5,
  randomSecretProb: 0.5
};

function run() {
  const words = ["CRANE", "BRAVE", "GRADE", "SLATE", "PLANE", "FLAME", "SHAME", "TRADE", "GRAPE", "BLAME"];
  const secretRows = words.map(word => ({ word, probability: 1 }));

  const state = {
    phase: "normal",
    setter: "AI",
    guesser: "G",
    turn: "AI",
    secret: "CRANE",
    pendingGuess: "SLATE",
    // Count Only: the guesser only saw ❓ for FLAME, so every word looks
    // possible to them -- but the real feedback rules most of them out.
    history: [{
      guess: "FLAME",
      fb: ["⬛", "⬛", "🟩", "⬛", "🟩"],
      fbGuesser: ["❓", "❓", "❓", "❓", "❓"]
    }],
    extraConstraints: [],
    powers: {}
  };

  const ai = createAI({ guessParams: {}, setterParams: SETTER_PARAMS });
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    state.aiSecretChangeCount = 0;
    const secret = ai.pickSecret(state, secretRows);
    seen.add(secret);
    const res = checkSecret({ secret, state, allowedSecrets: words });
    assert.ok(res.ok, `AI proposed ${secret}, which the server rejects (${res.code})`);
  }
  assert.ok(seen.size > 1, "test setup: the AI should still switch to other legal words, not only keep");

  console.log("PASS aiSecretRespectsTrueFeedback: under a masking power the AI Secretkeeper only proposes secrets consistent with the real feedback");
}

module.exports = { run };

if (require.main === module) {
  run();
}
