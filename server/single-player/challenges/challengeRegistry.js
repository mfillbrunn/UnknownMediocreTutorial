// UMT_CHALLENGES_V1
"use strict";

// Add future challenges here. The powered role is the AI role that is forced
// to use exactly this power whenever the normal AI runner says it is usable.
// The opposite AI role keeps its ordinary power pool.
const CHALLENGES = Object.freeze([
  Object.freeze({
    id: "count-only",
    title: "Count Only",
    summary: "The AI Secretkeeper uses Count Only on every eligible turn.",
    powerId: "countOnly",
    powerRole: "setter",
    icon: "🔢"
  })
]);

const DIFFICULTIES = Object.freeze({
  easy:   Object.freeze({ id: "easy", label: "Easy", aiDifficulty: 1 }),
  medium: Object.freeze({ id: "medium", label: "Medium", aiDifficulty: 2 }),
  hard:   Object.freeze({ id: "hard", label: "Hard", aiDifficulty: 3 })
});

function getChallenge(id) {
  return CHALLENGES.find(c => c.id === id) || null;
}
function getDifficulty(id) {
  return DIFFICULTIES[id] || null;
}
function publicCatalog() {
  return {
    challenges: CHALLENGES.map(c => ({ ...c })),
    difficulties: Object.values(DIFFICULTIES).map(d => ({ id: d.id, label: d.label }))
  };
}

module.exports = { CHALLENGES, DIFFICULTIES, getChallenge, getDifficulty, publicCatalog };
