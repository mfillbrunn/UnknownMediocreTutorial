// server/single-player/objectiveEngine.js
//
// Pure, registry-based objective evaluation. A stage's objectives never
// contain executable code -- just a type id (one of KNOWN_OBJECTIVE_TYPES)
// plus a plain-data params object, optionally composed with all/any/not.
// Evaluators read a normalized, immutable "facts" object built once per
// completed attempt (see buildFacts) and must never mutate anything.

"use strict";

const KNOWN_OBJECTIVE_TYPES = Object.freeze([
  "completeStage",
  "winRound",
  "winMatch",
  "winBothRoles",
  "guessWithin",
  "surviveTurnsAtLeast",
  "remainingWordsAtMost",
  "completeQuestsAtLeast",
  "scoreAtLeast",
  "pointDifferentialAtLeast",
  "usePowerAtLeast",
  "avoidPower",
  "starsEarnedAtLeast"
]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Each evaluator: (params, facts) => boolean. Never throws on well-formed
// input (stageSchema.js is responsible for rejecting malformed params
// before a stage is ever registered); a defensively-coded evaluator here
// just protects against a facts object that doesn't have the field yet.
const EVALUATORS = Object.freeze({
  completeStage: (params, facts) => facts.matchWon === true,

  winMatch: (params, facts) => facts.matchWon === true,

  winRound: (params, facts) => {
    const rounds = facts.rounds || [];
    if (isFiniteNumber(params?.round)) {
      const round = rounds[params.round - 1];
      return !!round && round.won === true;
    }
    return rounds.some(round => round.won === true);
  },

  winBothRoles: (params, facts) => {
    const rounds = facts.rounds || [];
    return rounds.length >= 2 && rounds.every(round => round.won === true);
  },

  guessWithin: (params, facts) => {
    const maxGuesses = params?.maxGuesses;
    if (!isFiniteNumber(maxGuesses)) return false;
    return (facts.rounds || []).some(round =>
      round.role === "guesser" &&
      round.won === true &&
      isFiniteNumber(round.guessCount) &&
      round.guessCount <= maxGuesses
    );
  },

  surviveTurnsAtLeast: (params, facts) => {
    const turns = params?.turns;
    if (!isFiniteNumber(turns)) return false;
    return (facts.rounds || []).some(round =>
      round.role === "setter" &&
      (round.won === true || (isFiniteNumber(round.guessCount) && round.guessCount >= turns))
    );
  },

  remainingWordsAtMost: (params, facts) => {
    const count = params?.count;
    if (!isFiniteNumber(count)) return false;
    return (facts.rounds || []).some(round =>
      isFiniteNumber(round.remainingWordsAtEnd) && round.remainingWordsAtEnd <= count
    );
  },

  completeQuestsAtLeast: (params, facts) => {
    const count = params?.count;
    if (!isFiniteNumber(count)) return false;
    const role = params?.role;
    const total = (facts.rounds || [])
      .filter(round => !role || round.role === role)
      .reduce((sum, round) => sum + (Number(round.questsCompleted) || 0), 0);
    return total >= count;
  },

  scoreAtLeast: (params, facts) => {
    const score = params?.score;
    if (!isFiniteNumber(score)) return false;
    return (Number(facts.totalScore) || 0) >= score;
  },

  pointDifferentialAtLeast: (params, facts) => {
    const points = params?.points;
    if (!isFiniteNumber(points)) return false;
    const diff = (Number(facts.totalScore) || 0) - (Number(facts.totalOpponentScore) || 0);
    return diff >= points;
  },

  usePowerAtLeast: (params, facts) => {
    const { powerId, count } = params || {};
    if (!powerId || !isFiniteNumber(count)) return false;
    return (Number(facts.powersUsed?.[powerId]) || 0) >= count;
  },

  avoidPower: (params, facts) => {
    const powerId = params?.powerId;
    if (!powerId) return false;
    return !((Number(facts.powersUsed?.[powerId]) || 0) > 0);
  },

  starsEarnedAtLeast: (params, facts) => {
    const count = params?.count;
    if (!isFiniteNumber(count)) return false;
    return (Number(facts.totalCampaignStars) || 0) >= count;
  }
});

// A single objective expression node is either:
//   { type: "<objectiveType>", params: {...} }        -- a leaf
//   { all: [<node>, ...] } | { any: [...] } | { not: <node> }  -- composite
function evaluateNode(node, facts) {
  if (!node || typeof node !== "object") return false;

  if (Array.isArray(node.all)) {
    return node.all.every(child => evaluateNode(child, facts));
  }
  if (Array.isArray(node.any)) {
    return node.any.some(child => evaluateNode(child, facts));
  }
  if (node.not) {
    return !evaluateNode(node.not, facts);
  }
  if (typeof node.type === "string") {
    const evaluator = EVALUATORS[node.type];
    return evaluator ? evaluator(node.params, facts) : false;
  }
  return false;
}

// Evaluates every objective in a stage's `objectives` array against facts.
// Returns { requiredPassed, results: { [objectiveId]: boolean } }. An
// objective without `required: true` is optional/bonus and never blocks
// stage completion on its own.
function evaluateObjectives(objectives, facts) {
  const results = {};
  let requiredPassed = true;

  for (const objective of objectives || []) {
    const passed = evaluateNode(objective.expression, facts);
    results[objective.id] = passed;
    if (objective.required && !passed) requiredPassed = false;
  }

  return { requiredPassed, results: Object.freeze(results) };
}

// Builds the normalized, read-only facts object evaluators consume. Kept
// deliberately small and flat -- everything an evaluator needs, nothing an
// evaluator (or a stage author, since these numbers can end up displayed)
// shouldn't see. `totalCampaignStars` is supplied by the caller (from
// progressRepository) since it isn't derivable from a single attempt.
// `powersUsed` is a flat { [powerId]: count } across the whole attempt
// (not per round) -- the engine has no reliable per-round breakdown of a
// power use, only a running total tracked at the moment it's applied (see
// server/core/phases/normal.js's guarded campaign hook).
function buildFacts({ rounds, totalCampaignStars, powersUsed } = {}) {
  const normalizedRounds = (rounds || []).map(round => Object.freeze({
    role: round.role === "setter" ? "setter" : "guesser",
    won: round.won === true,
    guessCount: isFiniteNumber(round.guessCount) ? round.guessCount : null,
    remainingWordsAtEnd: isFiniteNumber(round.remainingWordsAtEnd) ? round.remainingWordsAtEnd : null,
    questsCompleted: Number(round.questsCompleted) || 0,
    points: Number(round.points) || 0,
    opponentPoints: Number(round.opponentPoints) || 0
  }));

  const totalScore = normalizedRounds.reduce((sum, r) => sum + r.points, 0);
  const totalOpponentScore = normalizedRounds.reduce((sum, r) => sum + r.opponentPoints, 0);
  const matchWon = normalizedRounds.length > 0 && normalizedRounds.every(r => r.won);

  return Object.freeze({
    rounds: Object.freeze(normalizedRounds),
    matchWon,
    totalScore,
    totalOpponentScore,
    totalCampaignStars: Number(totalCampaignStars) || 0,
    powersUsed: Object.freeze({ ...(powersUsed || {}) })
  });
}

module.exports = {
  KNOWN_OBJECTIVE_TYPES,
  evaluateObjectives,
  evaluateNode,
  buildFacts
};
