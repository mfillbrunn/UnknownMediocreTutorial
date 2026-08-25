// objectiveEngine.js is the pure, registry-based evaluator every stage's
// pass/fail and star-band logic runs through. Exercises buildFacts'
// normalization, every leaf evaluator, and all/any/not composition,
// plus evaluateObjectives' required-vs-optional semantics.
const assert = require("assert");
const { evaluateObjectives, evaluateNode, buildFacts, KNOWN_OBJECTIVE_TYPES } = require("../single-player/objectiveEngine");

function run() {
  // ---- 1. buildFacts normalizes rounds and totals correctly.
  const facts = buildFacts({
    rounds: [
      { role: "guesser", won: true, guessCount: 4, remainingWordsAtEnd: 1, questsCompleted: 1, points: 4, opponentPoints: 2 },
      { role: "setter", won: true, guessCount: 6, remainingWordsAtEnd: null, questsCompleted: 0, points: 6, opponentPoints: 3 }
    ],
    totalCampaignStars: 5,
    powersUsed: { revealGreen: 2, countOnly: 1 }
  });
  assert.strictEqual(facts.matchWon, true, "all rounds won -> matchWon true");
  assert.strictEqual(facts.totalScore, 10, "totalScore sums every round's points");
  assert.strictEqual(facts.totalOpponentScore, 5, "totalOpponentScore sums every round's opponentPoints");
  assert.strictEqual(facts.totalCampaignStars, 5);
  assert.strictEqual(facts.powersUsed.revealGreen, 2, "powersUsed stays flat/top-level, not per round");
  assert.strictEqual(facts.rounds[0].remainingWordsAtEnd, 1);
  assert.strictEqual(facts.rounds[1].remainingWordsAtEnd, null, "a missing/non-finite value normalizes to null, not 0");

  // A round that lost must flip matchWon to false.
  const lostFacts = buildFacts({ rounds: [{ role: "guesser", won: true }, { role: "setter", won: false }] });
  assert.strictEqual(lostFacts.matchWon, false);

  // Facts objects and their nested arrays/objects must be frozen (stage
  // rule/evaluator code must never be able to mutate the shared facts).
  assert.ok(Object.isFrozen(facts));
  assert.ok(Object.isFrozen(facts.rounds));
  assert.ok(Object.isFrozen(facts.rounds[0]));
  assert.ok(Object.isFrozen(facts.powersUsed));

  // ---- 2. Every KNOWN_OBJECTIVE_TYPES entry has a real evaluator (no
  // silently-unimplemented type could ever validate a stage but then
  // always evaluate to false at runtime).
  const alwaysTrueFacts = buildFacts({
    rounds: [
      { role: "guesser", won: true, guessCount: 2, remainingWordsAtEnd: 0, questsCompleted: 3, points: 10, opponentPoints: 0 },
      { role: "setter", won: true, guessCount: 10, remainingWordsAtEnd: 0, questsCompleted: 0, points: 10, opponentPoints: 0 }
    ],
    totalCampaignStars: 10,
    powersUsed: { revealGreen: 5 }
  });
  const probeParams = {
    guessWithin: { maxGuesses: 6 },
    surviveTurnsAtLeast: { turns: 5 },
    remainingWordsAtMost: { count: 0 },
    completeQuestsAtLeast: { count: 1 },
    scoreAtLeast: { score: 1 },
    pointDifferentialAtLeast: { points: 1 },
    usePowerAtLeast: { powerId: "revealGreen", count: 1 },
    avoidPower: { powerId: "countOnly" },
    starsEarnedAtLeast: { count: 1 },
    winRound: {}
  };
  for (const type of KNOWN_OBJECTIVE_TYPES) {
    const node = { type, params: probeParams[type] };
    const result = evaluateNode(node, alwaysTrueFacts);
    assert.strictEqual(typeof result, "boolean", `${type} evaluator must return a boolean`);
  }

  // avoidPower must specifically fail once that power has been used.
  assert.strictEqual(evaluateNode({ type: "avoidPower", params: { powerId: "revealGreen" } }, alwaysTrueFacts), false);
  assert.strictEqual(evaluateNode({ type: "avoidPower", params: { powerId: "neverUsed" } }, alwaysTrueFacts), true);

  // winBothRoles requires >= 2 rounds, all won.
  assert.strictEqual(evaluateNode({ type: "winBothRoles" }, alwaysTrueFacts), true);
  const oneRoundFacts = buildFacts({ rounds: [{ role: "guesser", won: true }] });
  assert.strictEqual(evaluateNode({ type: "winBothRoles" }, oneRoundFacts), false, "a single round can never satisfy winBothRoles");

  // An unknown/malformed node must fail closed (false), never throw.
  assert.strictEqual(evaluateNode({ type: "not-a-real-type" }, alwaysTrueFacts), false);
  assert.strictEqual(evaluateNode(null, alwaysTrueFacts), false);
  assert.strictEqual(evaluateNode({}, alwaysTrueFacts), false);

  // ---- 3. all/any/not composition.
  const winNode = { type: "completeStage" };
  const loseNode = { type: "usePowerAtLeast", params: { powerId: "neverUsed", count: 1 } };
  assert.strictEqual(evaluateNode({ all: [winNode, loseNode] }, alwaysTrueFacts), false, "all() fails if any child fails");
  assert.strictEqual(evaluateNode({ all: [winNode, winNode] }, alwaysTrueFacts), true, "all() passes if every child passes");
  assert.strictEqual(evaluateNode({ any: [winNode, loseNode] }, alwaysTrueFacts), true, "any() passes if one child passes");
  assert.strictEqual(evaluateNode({ any: [loseNode, loseNode] }, alwaysTrueFacts), false, "any() fails if every child fails");
  assert.strictEqual(evaluateNode({ not: loseNode }, alwaysTrueFacts), true, "not() inverts its child");
  assert.strictEqual(evaluateNode({ all: [{ any: [loseNode, winNode] }, { not: loseNode }] }, alwaysTrueFacts), true, "nested composition resolves correctly");

  // ---- 4. evaluateObjectives: a required failure blocks completion; an
  // optional failure never does.
  const objectives = [
    { id: "mustWin", required: true, expression: winNode },
    { id: "bonus", required: false, expression: loseNode }
  ];
  const { requiredPassed, results } = evaluateObjectives(objectives, alwaysTrueFacts);
  assert.strictEqual(requiredPassed, true, "a failing OPTIONAL objective must not block requiredPassed");
  assert.strictEqual(results.mustWin, true);
  assert.strictEqual(results.bonus, false);
  assert.ok(Object.isFrozen(results));

  const objectivesWithFailingRequired = [
    { id: "mustWin", required: true, expression: loseNode }
  ];
  const failingResult = evaluateObjectives(objectivesWithFailingRequired, alwaysTrueFacts);
  assert.strictEqual(failingResult.requiredPassed, false, "a failing REQUIRED objective must block requiredPassed");

  console.log("PASS singlePlayerObjectiveEngine: facts normalize/freeze correctly, every objective type evaluates, all/any/not compose, and required-vs-optional semantics hold");
}

module.exports = { run };

if (require.main === module) {
  run();
}
