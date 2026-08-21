// core/simulation/runRewardSimulation.js
// Reward simulator: runs a normal first round, then tests one reward in round 2.
const { rooms, createRoom, addAIPlayer } = require("../rooms");
const { applyAction } = require("../applyAction");
const { computeAIActionForUser, buildPowerAction } = require("../ai/runAI");
const powerChoice = require("../../power-choice/powerChoiceServer");

const SEAT_A = "simrA";
const SEAT_B = "AI";
const MAX_TICKS_PER_ROUND = 90;

function yieldEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}
function thresholdForTier(role, tier) {
  const sequence = role === "setter" ? powerChoice.SPY_THRESHOLDS : powerChoice.INSPECTOR_REWARD_SEQUENCE;
  return tier === 1 ? sequence[0] : tier === 2 ? sequence[1] : sequence[2];
}
function rewardPool(role, tier) {
  return role === "setter" ? powerChoice.setterRewardPool() : powerChoice.guesserRewardPool(tier);
}
function getRewardCatalog(role, tier) {
  return rewardPool(role, tier).map(option => ({ id: option.id, label: option.title, icon: option.icon }));
}
function buildOptionForReward(role, tier, rewardId) {
  return rewardPool(role, tier).find(option => option.id === rewardId) || null;
}
function getTestableRewards(roleFilter, tierFilter) {
  const roles = roleFilter === "all" ? ["setter", "guesser"] : [roleFilter];
  const tiers = tierFilter === "all" ? [1, 2, 3] : [Number(tierFilter)];
  const results = [];
  for (const role of roles) {
    for (const tier of tiers) {
      for (const reward of getRewardCatalog(role, tier)) {
        results.push({ role, tier, rewardId: reward.id, label: reward.label, icon: reward.icon });
      }
    }
  }
  return results;
}
function suppressNaturalRewards(state) {
  const pc = state.powerChoice;
  if (!pc) return;
  if (pc.spy) pc.spy.queuedMilestones = [];
  if (pc.inspector) pc.inspector.queuedMilestones = [];
  pc.pendingChoice = null;
}
function roleMatches(state, role) {
  return role === "setter" ? state.setter === SEAT_A : state.guesser === SEAT_A;
}
function ownerCanChoose(state, role) {
  if (state.phase !== "normal" || state.turn !== SEAT_A) return false;
  return role === "setter" ? !!state.pendingGuess : !state.pendingGuess;
}
function payloadForOption(option, state, context) {
  if (option?.kind !== "power") return undefined;
  const action = buildPowerAction(option.powerId, state, context);
  if (!action) return null;
  const payload = { ...action };
  delete payload.type;
  delete payload.userId;
  delete payload.powerId;
  delete payload.source;
  return payload;
}
function runRound(room, roomId, context, { role, tier, option, withReward }) {
  let ticks = 0;
  let rewardApplied = !withReward;
  let appliedAtTick = null;
  while (!room.state.gameOver && ticks < MAX_TICKS_PER_ROUND) {
    suppressNaturalRewards(room.state);
    if (
      withReward &&
      !rewardApplied &&
      option &&
      roleMatches(room.state, role) &&
      ownerCanChoose(room.state, role) &&
      powerChoice.optionApplicable(room.state, option)
    ) {
      const payload = payloadForOption(option, room.state, context);
      if (payload !== null) {
        const choice = {
          ownerUserId: SEAT_A,
          role,
          threshold: thresholdForTier(role, tier),
          tier
        };
        rewardApplied = !!powerChoice.applyChoice(
          room.state,
          option,
          choice,
          room,
          roomId,
          context.io,
          context,
          payload
        );
        if (rewardApplied) appliedAtTick = ticks;
      }
    }

    const seatAAction = computeAIActionForUser(room, roomId, context, SEAT_A);
    if (seatAAction) seatAAction();
    suppressNaturalRewards(room.state);

    if (!room.state.gameOver) {
      const seatBAction = computeAIActionForUser(room, roomId, context, SEAT_B);
      if (seatBAction) seatBAction();
      suppressNaturalRewards(room.state);
    }
    ticks++;
  }
  return {
    completed: !!room.state.gameOver,
    guessCount: room.state.guessCount,
    rewardApplied,
    appliedAtTick,
    ticks
  };
}
function runSingleRewardTrial({ role, tier, rewardId, aiDifficulty, withReward }, context) {
  const fakeSocket = { id: "simr_" + Math.random().toString(36).slice(2), join() {} };
  const roomId = createRoom(fakeSocket, SEAT_A);
  const room = rooms[roomId];
  try {
    addAIPlayer(room, aiDifficulty);
    room.state.aiDifficulty = aiDifficulty;
    applyAction(room, room.state, { type: "SET_DRAFT_MODE", draftMode: false, userId: SEAT_A }, roomId, context);
    applyAction(room, room.state, { type: "SET_POWER_MODE", mode: "powerChoice", userId: SEAT_A }, roomId, context);

    // Roles swap between rounds. Arrange round 1 so SEAT_A owns the requested
    // role in round 2, where the reward is measured.
    if (role === "setter") {
      applyAction(room, room.state, { type: "SWITCH_ROLES", userId: SEAT_A }, roomId, context);
    }

    applyAction(room, room.state, { type: "PLAYER_READY", userId: SEAT_A }, roomId, context);
    room.state.aiDifficulty = aiDifficulty;

    const roundOne = runRound(room, roomId, context, { role, tier, option: null, withReward: false });
    if (!roundOne.completed || !room.state.canNextRound || room.state.gameOverView !== "round") return null;

    applyAction(room, room.state, { type: "NEXT_ROUND", userId: SEAT_A }, roomId, context);
    room.state.aiDifficulty = aiDifficulty;
    if (!roleMatches(room.state, role)) return null;

    const option = withReward ? buildOptionForReward(role, tier, rewardId) : null;
    const roundTwo = runRound(room, roomId, context, { role, tier, option, withReward });
    if (!roundTwo.completed) return null;
    if (withReward && !roundTwo.rewardApplied) return null;

    return {
      guessCount: roundTwo.guessCount,
      rewardApplied: roundTwo.rewardApplied,
      appliedAtTick: roundTwo.appliedAtTick,
      round2Completed: roundTwo.completed
    };
  } finally {
    delete rooms[roomId];
  }
}
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
async function runRewardBatch(args, context, onProgress) {
  const results = [];
  let excluded = 0;
  let used = 0;
  for (let index = 0; index < args.runs; index++) {
    const result = runSingleRewardTrial(args, context);
    if (result) {
      results.push(result.guessCount);
      if (args.withReward && result.rewardApplied) used++;
    } else {
      excluded++;
    }
    if (index % 5 === 4) await yieldEventLoop();
    onProgress?.({ completed: index + 1, total: args.runs });
  }
  return {
    completed: results.length,
    excluded,
    used,
    avg: average(results),
    min: results.length ? Math.min(...results) : null,
    max: results.length ? Math.max(...results) : null,
    raw: results
  };
}
function combineRewardBatches(meta, withBatch, baselineBatch) {
  return {
    ...meta,
    measuredRound: 2,
    completedWithReward: withBatch.completed,
    excludedWithReward: withBatch.excluded,
    usedWithReward: withBatch.used,
    useRate: meta.runs ? withBatch.used / meta.runs : 0,
    completedBaseline: baselineBatch.completed,
    avgWithReward: withBatch.avg,
    avgBaseline: baselineBatch.avg,
    minWithReward: withBatch.min,
    maxWithReward: withBatch.max,
    minBaseline: baselineBatch.min,
    maxBaseline: baselineBatch.max,
    rawWithReward: withBatch.raw,
    rawBaseline: baselineBatch.raw
  };
}
async function runRewardSimulation({ role, tier, rewardId, runs = 100, aiDifficulty = 2 }, context, onProgress) {
  if (!["setter", "guesser"].includes(role)) throw new Error("role must be 'setter' or 'guesser'");
  const tierNumber = Number(tier);
  if (![1, 2, 3].includes(tierNumber)) throw new Error("tier must be 1, 2, or 3");
  const found = getRewardCatalog(role, tierNumber).find(reward => reward.id === rewardId);
  if (!found) throw new Error("rewardId not found in this role/tier catalog");
  const runCount = Math.max(1, Math.min(1000, Number(runs) || 100));
  const meta = { role, tier: tierNumber, rewardId, label: found.label, icon: found.icon, runs: runCount, aiDifficulty };
  const withBatch = await runRewardBatch({ role, tier: tierNumber, rewardId, aiDifficulty, runs: runCount, withReward: true }, context, progress => onProgress?.({ phase: "reward", ...progress }));
  const baselineBatch = await runRewardBatch({ role, tier: tierNumber, rewardId, aiDifficulty, runs: runCount, withReward: false }, context, progress => onProgress?.({ phase: "baseline", ...progress }));
  return combineRewardBatches(meta, withBatch, baselineBatch);
}
async function runAllRewardSimulations({ role = "all", tier = "all", runs = 100, aiDifficulty = 2 }, context, onProgress) {
  const tests = getTestableRewards(role, tier);
  const output = [];
  for (let index = 0; index < tests.length; index++) {
    const test = tests[index];
    const result = await runRewardSimulation({ ...test, runs, aiDifficulty }, context, progress => onProgress?.({ rewardIndex: index + 1, rewardTotal: tests.length, rewardLabel: test.label, ...progress }));
    output.push(result);
  }
  return output;
}
module.exports = {
  getRewardCatalog,
  getTestableRewards,
  runRewardSimulation,
  runAllRewardSimulations
};
