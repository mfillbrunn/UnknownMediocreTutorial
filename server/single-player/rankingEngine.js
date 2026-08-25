// server/single-player/rankingEngine.js
//
// Pure ranking: turns a stage's already-evaluated objectives plus the raw
// facts object into a deterministic { completed, score, stars, rankLabel,
// objectiveResults }. Never touches engine state or storage.

"use strict";

const { evaluateNode } = require("./objectiveEngine");

function computeScore(scoreConfig, facts, optionalPassedCount) {
  const cfg = scoreConfig || {};
  const base = Number(cfg.base) || 0;
  const perPointDifferential = Number(cfg.perPointDifferential) || 0;
  const perOptionalObjective = Number(cfg.perOptionalObjective) || 0;
  const turnPenaltyPerGuess = Number(cfg.turnPenaltyPerGuess) || 0;

  const differential = (Number(facts.totalScore) || 0) - (Number(facts.totalOpponentScore) || 0);
  const totalGuesses = (facts.rounds || []).reduce(
    (sum, round) => sum + (Number(round.guessCount) || 0),
    0
  );

  const raw =
    base +
    differential * perPointDifferential +
    optionalPassedCount * perOptionalObjective -
    totalGuesses * turnPenaltyPerGuess;

  return Math.max(0, Math.round(raw));
}

// Bands are evaluated highest-stars-first; the first whose expression
// passes wins. A band's `expression` uses the same objective-expression
// shape objectiveEngine.evaluateNode already understands (leaf/all/any/not),
// so a band can require e.g. { type: "surviveTurnsAtLeast", params: { turns: 8 } }.
function starsForBands(bands, facts) {
  const sorted = [...(bands || [])].sort((a, b) => (b.stars || 0) - (a.stars || 0));
  for (const band of sorted) {
    if (evaluateNode(band.expression, facts)) {
      return band.stars || 0;
    }
  }
  return 0;
}

function rankLabelFor(rankLabels, stars) {
  const labels = rankLabels || {};
  return labels[String(stars)] || labels[stars] || (stars > 0 ? `${stars}-star` : "No stars");
}

// stage.ranking: { score: {...}, bands: [{stars, expression}], rankLabels }
// objectiveResults/requiredPassed come from objectiveEngine.evaluateObjectives.
// optionalObjectiveIds: ids of the stage's non-required objectives, so their
// pass count can feed the score bonus without re-deriving "required" here.
function rankStage({ ranking, facts, objectiveResults, requiredPassed, optionalObjectiveIds }) {
  const optionalPassedCount = (optionalObjectiveIds || [])
    .filter(id => objectiveResults?.[id] === true)
    .length;

  if (!requiredPassed) {
    return Object.freeze({
      completed: false,
      score: 0,
      stars: 0,
      rankLabel: rankLabelFor(ranking?.rankLabels, 0),
      objectiveResults: objectiveResults || {}
    });
  }

  const stars = starsForBands(ranking?.bands, facts);
  const score = computeScore(ranking?.score, facts, optionalPassedCount);

  return Object.freeze({
    completed: true,
    score,
    stars,
    rankLabel: rankLabelFor(ranking?.rankLabels, stars),
    objectiveResults: objectiveResults || {}
  });
}

module.exports = { rankStage };
