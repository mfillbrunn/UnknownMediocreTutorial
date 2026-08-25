// server/single-player/publicState.js
//
// Everything the campaign client is allowed to see, and nothing else.
// Two shapes come out of here:
//   - buildPublicSinglePlayerSnapshot: the small live-game snapshot mixed
//     into the normal per-player safeState (see safeState.js's guarded
//     hook) -- current stage/role/objective display, no future AI words,
//     no checkpoint internals.
//   - buildCampaignManifest: the campaign map payload (stages + progress +
//     unlocks + achievements) sent in response to singlePlayer:getCampaign,
//     entirely separate from any live game state.

"use strict";

const DIFFICULTY_LABELS = { 1: "Easy", 2: "Medium", 3: "Hard" };

// state.singlePlayer carries everything the server needs (including the
// private round-by-round plan built at session start -- see
// sessionService.js) but only these fields are safe to hand to the client.
function buildPublicSinglePlayerSnapshot(state, userId) {
  const sp = state?.singlePlayer;
  if (!sp || !sp.enabled) return { enabled: false };

  const stage = sp.stage;
  const humanRole = sp.humanUserId === state.setter ? "setter" : "guesser";

  return {
    enabled: true,
    stageId: stage.id,
    stageTitle: stage.title,
    mapLabel: stage.map.label,
    role: humanRole,
    difficultyLabel: DIFFICULTY_LABELS[stage.game.difficulty] || "Medium",
    roundIndex: state.roundIndex,
    roundsTotal: state.roundsTotal,
    storyPhase: sp.storyPhase || "in_game",
    attemptNo: sp.attemptNo,
    // Display-only copies of this stage's objective ids/required flags --
    // never the evaluated pass/fail (that's only known at stage end) and
    // never the expression internals (a player shouldn't be able to read
    // off the exact threshold from devtools mid-attempt if the stage
    // author wants it to read as a soft target).
    objectives: (stage.objectives || []).map(o => ({ id: o.id, required: !!o.required, label: o.label || o.id }))
  };
}

function stageMapStatus({ stageId, unlockedStageIds, progressByStageId }) {
  if (!unlockedStageIds.has(stageId)) return "locked";
  const progress = progressByStageId.get(stageId);
  if (progress?.status === "completed") return "completed";
  if (progress?.status === "in_progress") return "in_progress";
  return "available";
}

// stages: frozen stage list from stageRegistry. unlocks/progress/powers
// come from progressRepository -- plain rows, already scoped to this user.
function buildCampaignManifest({ stages, unlocks, progress, powerUnlocks, achievements }) {
  const unlockedStageIds = new Set((unlocks || []).map(row => row.stage_id));
  const progressByStageId = new Map((progress || []).map(row => [row.stage_id, row]));

  const mapNodes = stages.map(stage => {
    const stageProgress = progressByStageId.get(stage.id);
    return {
      id: stage.id,
      chapter: stage.chapter,
      order: stage.order,
      title: stage.title,
      summary: stage.summary,
      map: { label: stage.map.label, x: stage.map.x, y: stage.map.y, next: stage.map.next },
      status: stageMapStatus({ stageId: stage.id, unlockedStageIds, progressByStageId }),
      bestStars: stageProgress?.best_stars || 0,
      bestScore: stageProgress?.best_score ?? null,
      attempts: stageProgress?.attempts || 0,
      role: stage.game.roles,
      difficultyLabel: DIFFICULTY_LABELS[stage.game.difficulty] || "Medium"
    };
  });

  return {
    stages: mapNodes,
    powerUnlocks: (powerUnlocks || []).map(row => ({ role: row.role, powerId: row.power_id })),
    achievements: achievements || []
  };
}

module.exports = { buildPublicSinglePlayerSnapshot, buildCampaignManifest };
