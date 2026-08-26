const assert = require("assert");
const spyChargeServer = require("../powers/powers/spyChargeServer");
const coverStrength = require("../utils/coverStrength");

const ALLOWED_SECRETS = [
  "APPLE", "AMPLY", "APPLY", "AMPLE",
  "ANGLE", "ANKLE", "MANGO", "GRAPE",
  "PLANE", "SLATE", "CRANE", "BRICK",
  "SHORE", "STARE", "STORE", "SCORE"
];

function makeState() {
  return {
    phase: "normal",
    setter: "S",
    guesser: "G",
    turn: "S",
    secret: "APPLE",
    pendingGuess: "MANGO",
    history: [],
    extraConstraints: [],
    simultaneousAllWrong: false,
    powers: {
      spyCharge: {
        enabled: true,
        total: 0,
        resetsUsed: 0,
        hint: null
      }
    }
  };
}

function run() {
  // Exact threshold: 24% worse -> 2; 25% worse -> 1.
  assert.strictEqual(spyChargeServer.starsForCandidate(100, 100), 2);
  assert.strictEqual(spyChargeServer.starsForCandidate(76, 100), 2);
  assert.strictEqual(spyChargeServer.starsForCandidate(75, 100), 1);
  assert.strictEqual(spyChargeServer.starsForCandidate(50, 100), 1);

  const state = makeState();
  const analysis = coverStrength.getCoverAnalysis(state, ALLOWED_SECRETS);
  assert.ok(analysis && analysis.bestCount > 0);

  const alternatives = analysis.feasibleWords.filter(
    word => word !== analysis.currentSecret && word !== analysis.pendingGuess
  );
  const countFor = word =>
    coverStrength.getCandidateRemainingCount(analysis, word);

  const bestWord = alternatives.find(
    word => countFor(word) === analysis.bestCount
  );
  assert.ok(bestWord, "test setup needs an objectively best switch");

  state.powers.spyCharge.hint = null;
  const bestAward = spyChargeServer.evaluateSecretChange(
    state,
    bestWord,
    ALLOWED_SECRETS
  );
  assert.strictEqual(bestAward.baseStars, 2);

  const boundaryWord = alternatives.find(
    word => Math.abs(countFor(word) / analysis.bestCount - 0.75) < 1e-9
  );
  assert.ok(boundaryWord, "test setup needs a switch exactly 25% below best");
  const boundaryAward = spyChargeServer.evaluateSecretChange(
    state,
    boundaryWord,
    ALLOWED_SECRETS
  );
  assert.strictEqual(boundaryAward.baseStars, 1);

  // KEEP is always exactly one and never earns the blue bonus.
  state.powers.spyCharge.hint = {
    letter: state.secret[0],
    position: 0
  };
  const keepAward = spyChargeServer.evaluateSecretChange(
    state,
    state.secret,
    ALLOWED_SECRETS
  );
  assert.deepStrictEqual(
    {
      baseStars: keepAward.baseStars,
      bonusStars: keepAward.bonusStars,
      earnedStars: keepAward.earnedStars
    },
    { baseStars: 1, bonusStars: 0, earnedStars: 1 }
  );

  // Find a weak switch that still matches a bonus target from a best word.
  const bestWords = alternatives.filter(
    word => countFor(word) === analysis.bestCount
  );
  let weakWord = null;
  let weakHint = null;

  for (const sourceWord of bestWords) {
    for (let position = 0; position < 5; position += 1) {
      const letter = sourceWord[position];
      if (letter === state.secret[position]) continue;
      const candidate = alternatives.find(
        word =>
          countFor(word) < analysis.bestCount * 0.75 &&
          word[position] === letter
      );
      if (candidate) {
        weakWord = candidate;
        weakHint = { letter, position };
        break;
      }
    }
    if (weakWord) break;
  }

  assert.ok(weakWord && weakHint, "test setup needs a weak bonus-matching word");
  state.powers.spyCharge.hint = weakHint;
  const weakBonusAward = spyChargeServer.evaluateSecretChange(
    state,
    weakWord,
    ALLOWED_SECRETS
  );
  assert.deepStrictEqual(
    {
      baseStars: weakBonusAward.baseStars,
      bonusStars: weakBonusAward.bonusStars,
      earnedStars: weakBonusAward.earnedStars
    },
    { baseStars: 1, bonusStars: 1, earnedStars: 2 }
  );

  const bestBonusPosition = [...bestWord].findIndex(
    (letter, index) => letter !== state.secret[index]
  );
  assert.ok(bestBonusPosition >= 0);
  state.powers.spyCharge.hint = {
    letter: bestWord[bestBonusPosition],
    position: bestBonusPosition
  };
  const bestBonusAward = spyChargeServer.evaluateSecretChange(
    state,
    bestWord,
    ALLOWED_SECRETS
  );
  assert.deepStrictEqual(
    {
      baseStars: bestBonusAward.baseStars,
      bonusStars: bestBonusAward.bonusStars,
      earnedStars: bestBonusAward.earnedStars
    },
    { baseStars: 2, bonusStars: 1, earnedStars: 3 }
  );

  // Preview must agree with the real award.
  state.powers.spyCharge.hint = weakHint;
  const keepPreview = coverStrength.buildCoverStrengthState(
    state,
    ALLOWED_SECRETS,
    ""
  );
  assert.strictEqual(keepPreview.stars, 1);
  assert.strictEqual(keepPreview.bonusStar, false);

  const weakPreview = coverStrength.buildCoverStrengthState(
    state,
    ALLOWED_SECRETS,
    weakWord
  );
  assert.strictEqual(weakPreview.stars, 1);
  assert.strictEqual(weakPreview.bonusStar, true);

  console.log(
    "PASS setterStarRules: KEEP=1, NEW threshold=25%, bonus is independent and change-only"
  );
}

module.exports = { run };

if (require.main === module) {
  run();
}
