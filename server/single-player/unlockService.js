// server/single-player/unlockService.js
//
// Resolves a stage's per-round power/quest plan from stage config + the
// human's unlocked powers, and validates a reward "choose one" selection
// against the stage's own configured options before it's persisted.
// Pure logic -- no I/O; sessionService.js supplies the already-fetched
// unlocked-powers map and hands the result to campaignMode.js.

"use strict";

function resolveRolePowers({ stage, role, isHuman, humanUnlockedPowers }) {
  const policy = stage.game.powerPolicy || {};
  if (isHuman) {
    const fixed = policy.playerFixed?.[role] || [];
    if (fixed.length) return [...fixed];
    if (policy.playerUsesUnlocks !== false) return [...(humanUnlockedPowers?.[role] || [])];
    return [];
  }
  return [...(policy.opponentFixed?.[role] || [])];
}

function roundPlanFor({ stage, humanRole, humanUserId, aiUserId, questIndex, humanUnlockedPowers }) {
  const setterUserId = humanRole === "setter" ? humanUserId : aiUserId;
  const guesserUserId = humanRole === "guesser" ? humanUserId : aiUserId;

  return {
    humanRole,
    setterUserId,
    guesserUserId,
    setterPowers: resolveRolePowers({ stage, role: "setter", isHuman: humanRole === "setter", humanUnlockedPowers }),
    guesserPowers: resolveRolePowers({ stage, role: "guesser", isHuman: humanRole === "guesser", humanUnlockedPowers }),
    questType: humanRole === "guesser" ? (stage.game.quests?.guesserByRound?.[questIndex] || null) : null
  };
}

// Builds the full { rounds: [...] } plan campaignMode.js walks through.
// A "both" stage always plays firstRole first, then the other role --
// never re-derived from a swap so round 2's assignment stays explicit and
// auditable straight from stage config.
function buildRoundPlan({ stage, humanUserId, aiUserId, humanUnlockedPowers }) {
  const roles = stage.game.roles;

  if (roles === "both") {
    const firstRole = stage.game.firstRole === "setter" ? "setter" : "guesser";
    const secondRole = firstRole === "guesser" ? "setter" : "guesser";
    return {
      rounds: [
        roundPlanFor({ stage, humanRole: firstRole, humanUserId, aiUserId, questIndex: 0, humanUnlockedPowers }),
        roundPlanFor({ stage, humanRole: secondRole, humanUserId, aiUserId, questIndex: 1, humanUnlockedPowers })
      ]
    };
  }

  return {
    rounds: [
      roundPlanFor({ stage, humanRole: roles, humanUserId, aiUserId, questIndex: 0, humanUnlockedPowers })
    ]
  };
}

// Validates a submitted { choiceId, optionId } against the stage's
// rewards.chooseOne config. Returns the matched option (with its own
// role/powerId) or null if the choice/option id doesn't exist on this
// stage -- the caller must reject the request rather than trust the
// client's optionId blindly.
function resolveChosenRewardOption(stage, choiceId, optionId) {
  const choice = (stage.rewards?.chooseOne || []).find(c => c.id === choiceId);
  if (!choice) return null;
  const option = (choice.options || []).find(o => `${o.role}:${o.powerId}` === optionId || o.powerId === optionId);
  if (!option) return null;
  return { ...option, choiceId };
}

module.exports = { buildRoundPlan, resolveChosenRewardOption };
