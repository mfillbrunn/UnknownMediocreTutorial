// core/simulation/runRewardSimulation.js
//
// Developer tool: companion to runPowerSimulation.js/runQuestSimulation.js
// for Power Choice's own reward system (server/power-choice/powerChoiceServer.js)
// -- the Spyometer's setter rewards and the Inspector's quest rewards.
//
// Unlike the other two simulators, this one does NOT disable state.devMode:
// isPowerChoice() requires !state.devMode, so leaving it off is what keeps
// Power Choice's reward machinery live for the trial at all.
//
// Rather than waiting for stars/quest completions to organically cross a
// threshold (which would make "compare reward X to reward Y" unfair --
// whichever reward happened to arrive earlier or later would confound the
// result), each trial FORCES exactly one specific reward onto one specific
// seat by calling powerChoiceServer.applyChoice() directly, at a fixed
// point in the round: the seat's Nth action, per TARGET_TURN below. The
// natural queued-milestone system is neutralized every tick (queued
// milestones cleared, any pendingChoice cleared) so nothing else can also
// fire and confound the comparison -- "setter gets reward X on turn 3,
// Inspector gets nothing" is taken literally.
//
// Same real-engine, socket-free harness as the other two simulators
// (createRoom/applyAction/computeAIActionForUser), same yield-the-event-
// -loop-every-5-trials courtesy to concurrent live games. No Supabase
// persistence -- there's no reward_simulations table in this project (no
// migration files exist in the repo for the other two either; their tables
// were created out-of-band), so results are returned directly for the
// client to graph in place instead of being saved and re-read.

const { rooms, createRoom, addAIPlayer } = require("../rooms");
const { applyAction } = require("../applyAction");
const { computeAIActionForUser } = require("../ai/runAI");
const powerChoice = require("../../power-choice/powerChoiceServer");

const SEAT_A = "simrA";
const SEAT_B = "AI";
// Same generous ~10x margin over a typical round as the other two
// simulators' identical cap, for the identical reason.
const MAX_TICKS_PER_TRIAL = 60;

function yieldEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

// The exact turn numbers the user asked for: tier 1 is the first fixed
// reward tier (Spyometer's 5-star / Inspector's 2nd quest), tier 2 is the
// middle "3 random powers" milestone (9 stars / 3rd quest), tier 3 is the
// advanced fixed tier (15 stars / 5th quest). "Turn" here means "the Nth
// real action this seat has taken" (their own SUBMIT_GUESS or
// SET_SECRET_NEW/KEEP, counted from 1) -- not a star/quest count, since the
// whole point of forcing the reward is to remove star/quest timing as a
// variable and hold ONLY the reward itself under test.
const TARGET_TURN = {
  setter: { 1: 3, 2: 5, 3: 7 },
  guesser: { 1: 2, 2: 4, 3: 6 }
};

function thresholdForTier(role, tier) {
  const seq = role === "setter" ? powerChoice.SPY_THRESHOLDS : powerChoice.INSPECTOR_REWARD_SEQUENCE;
  return tier === 1 ? seq[0] : tier === 2 ? seq[1] : seq[2];
}

// Every testable reward for one role+tier, as plain {id, label, icon}
// descriptors. The setter draws from the SAME shared pool at all three
// thresholds now (see setterRewardPool in powerChoiceServer.js), so "tier"
// only affects which star threshold the reward is forced at for the
// setter, not which catalog it's drawn from -- unlike the Inspector,
// which still has a real per-tier catalog switch (tier 1/3 read straight
// off fixedOptions' own catalog, tier 2 is built from tierTwoPowerIds, the
// same static power-ID list threePowerOptions draws its random 3 from).
function getRewardCatalog(role, tier) {
  if (role === "setter") {
    return powerChoice.setterRewardPool().map((o) => ({ id: o.id, label: o.title, icon: o.icon }));
  }
  if (tier === 2) {
    return powerChoice.tierTwoPowerIds(role).map((id) => {
      const opt = powerChoice.powerOption(id);
      return { id: opt.id, label: opt.title, icon: opt.icon };
    });
  }
  const threshold = thresholdForTier(role, tier);
  return powerChoice.fixedOptions(role, threshold).map((o) => ({ id: o.id, label: o.title, icon: o.icon }));
}

function buildOptionForReward(role, tier, rewardId) {
  if (role === "setter") {
    return powerChoice.setterRewardPool().find((o) => o.id === rewardId) || null;
  }
  if (tier === 2) {
    const powerId = rewardId.startsWith("power:") ? rewardId.slice(6) : rewardId;
    return powerChoice.powerOption(powerId);
  }
  const threshold = thresholdForTier(role, tier);
  return powerChoice.fixedOptions(role, threshold).find((o) => o.id === rewardId) || null;
}

// role -> {id, tier} list for every role+tier combination matching the
// given filters. "all" for either filter expands to every value.
function getTestableRewards(roleFilter, tierFilter) {
  const roles = roleFilter === "all" ? ["setter", "guesser"] : [roleFilter];
  const tiers = tierFilter === "all" ? [1, 2, 3] : [Number(tierFilter)];
  const list = [];
  for (const role of roles) {
    for (const tier of tiers) {
      for (const reward of getRewardCatalog(role, tier)) {
        list.push({ role, tier, rewardId: reward.id, label: reward.label, icon: reward.icon });
      }
    }
  }
  return list;
}

// Neutralizes Power Choice's normal star/quest-threshold reward system for
// this trial -- called every tick, before either seat acts, so an
// organically-crossed threshold can never queue or open its own reward on
// top of (or instead of) the one this trial is deliberately forcing.
function suppressNaturalRewards(state) {
  const pc = state.powerChoice;
  if (!pc) return;
  if (pc.spy) pc.spy.queuedMilestones = [];
  if (pc.inspector) pc.inspector.queuedMilestones = [];
  pc.pendingChoice = null;
}

// Runs ONE trial round. SEAT_A always holds the role under test (switched
// into it if it's the guesser -- room creation defaults the host to
// setter). Applies the target reward directly via powerChoiceServer's
// applyChoice, the instant SEAT_A is about to take their Nth action (see
// TARGET_TURN) -- not via the normal pendingChoice/AI-pick flow, so the
// reward is unconditionally the one under test, not whatever the AI's own
// weighted pick would have chosen. If the reward is still inapplicable
// (rewardOptionApplicable false -- e.g. no green tile yet to fade) right
// at that turn, the check just retries every following tick until it
// either becomes applicable or the round ends; a trial where it never got
// the chance is excluded from the batch, the same way a timed-out trial
// is, rather than biasing the result with a reward that was never really
// granted. Returns { guessCount } or null if excluded.
function runSingleRewardTrial({ role, tier, rewardId, aiDifficulty, withReward }, context) {
  const fakeSocket = { id: "simr_" + Math.random().toString(36).slice(2), join() {} };
  const roomId = createRoom(fakeSocket, SEAT_A);
  const room = rooms[roomId];

  try {
    addAIPlayer(room, aiDifficulty);
    room.state.aiDifficulty = aiDifficulty;

    applyAction(room, room.state, { type: "SET_DRAFT_MODE", draftMode: false, userId: SEAT_A }, roomId, context);
    // SET_DRAFT_MODE above sets state.gameMode to "random" (see
    // handleAction's SET_DRAFT_MODE branch in powerChoiceServer.js) as a
    // side effect of disabling draft mode -- the other two simulators
    // don't care because they also force state.devMode = true, which
    // makes isPowerChoice() false regardless of gameMode. This simulator
    // needs Power Choice live, so explicitly switch back to it via the
    // same action a real lobby's mode toggle would send.
    applyAction(room, room.state, { type: "SET_POWER_MODE", mode: "powerChoice", userId: SEAT_A }, roomId, context);

    if (role === "guesser") {
      applyAction(room, room.state, { type: "SWITCH_ROLES", userId: SEAT_A }, roomId, context);
    }

    // state.devMode is deliberately left unset here -- isPowerChoice()
    // requires !state.devMode (see powerChoiceServer.js), and this
    // simulator needs Power Choice's real reward system live for
    // applyChoice below to have anywhere real to apply into.
    //
    // Note: PLAYER_READY starting the match REPLACES room.state wholesale
    // (see lobby.js's `room.state = freshState`), it doesn't mutate the
    // object in place -- so every reference below reads room.state fresh
    // rather than caching it in a local variable, the same way
    // runPowerSimulation.js/runQuestSimulation.js do. Caching it here
    // would silently keep operating on the stale pre-match lobby object
    // forever (this is exactly what happened during development: the
    // trial looked like it was spinning with the round stuck in "lobby").
    applyAction(room, room.state, { type: "PLAYER_READY", userId: SEAT_A }, roomId, context);

    const option = withReward ? buildOptionForReward(role, tier, rewardId) : null;
    const targetTurn = withReward ? TARGET_TURN[role][tier] : null;
    let seatAActionCount = 0;
    let applied = !withReward;

    let ticks = 0;
    while (!room.state.gameOver && ticks < MAX_TICKS_PER_TRIAL) {
      suppressNaturalRewards(room.state);

      if (withReward && !applied && option && seatAActionCount === targetTurn - 1) {
        const choice = { ownerUserId: SEAT_A, role, threshold: thresholdForTier(role, tier), tier };
        if (
          powerChoice.optionApplicable(room.state, option) &&
          powerChoice.applyChoice(room.state, option, choice, room, roomId, context.io, context)
        ) {
          applied = true;
        }
      }

      const aAction = computeAIActionForUser(room, roomId, context, SEAT_A);
      if (aAction) {
        seatAActionCount++;
        aAction();
      }

      if (!room.state.gameOver) {
        const bAction = computeAIActionForUser(room, roomId, context, SEAT_B);
        if (bAction) bAction();
      }

      ticks++;
    }

    if (!room.state.gameOver) return null;
    if (withReward && !applied) return null;
    return { guessCount: room.state.guessCount };
  } finally {
    delete rooms[roomId];
  }
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

async function runRewardBatch({ role, tier, rewardId, aiDifficulty, runs, withReward }, context, onProgress) {
  const results = [];
  let excluded = 0;
  for (let i = 0; i < runs; i++) {
    const result = runSingleRewardTrial({ role, tier, rewardId, aiDifficulty, withReward }, context);
    if (result != null) results.push(result.guessCount);
    else excluded++;
    if (i % 5 === 4) await yieldEventLoop();
    onProgress?.({ completed: i + 1, total: runs });
  }
  return {
    completed: results.length,
    excluded,
    avg: avg(results),
    min: results.length ? Math.min(...results) : null,
    max: results.length ? Math.max(...results) : null,
    raw: results
  };
}

function combineRewardBatches({ role, tier, rewardId, label, icon, runs, aiDifficulty }, withBatch, baselineBatch) {
  return {
    role,
    tier,
    rewardId,
    label,
    icon,
    runs,
    aiDifficulty,
    completedWithReward: withBatch.completed,
    excludedWithReward: withBatch.excluded,
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

// Runs `runs` trials with the one specific reward forced on, then `runs`
// more as a no-reward baseline -- same seat/role/AI difficulty throughout.
async function runRewardSimulation({ role, tier, rewardId, runs = 100, aiDifficulty = 2 }, context, onProgress) {
  if (role !== "setter" && role !== "guesser") {
    throw new Error("role must be 'setter' or 'guesser'");
  }
  const tierNum = Number(tier);
  if (![1, 2, 3].includes(tierNum)) {
    throw new Error("tier must be 1, 2, or 3");
  }
  const found = getRewardCatalog(role, tierNum).find((r) => r.id === rewardId);
  if (!found) {
    throw new Error("rewardId not found in this role/tier catalog");
  }

  const withBatch = await runRewardBatch(
    { role, tier: tierNum, rewardId, aiDifficulty, runs, withReward: true },
    context,
    (p) => onProgress?.({ stage: "with_reward", ...p })
  );
  const baselineBatch = await runRewardBatch(
    { role, tier: null, rewardId: null, aiDifficulty, runs, withReward: false },
    context,
    (p) => onProgress?.({ stage: "baseline", ...p })
  );

  return combineRewardBatches(
    { role, tier: tierNum, rewardId, label: found.label, icon: found.icon, runs, aiDifficulty },
    withBatch,
    baselineBatch
  );
}

// Tests every reward matching the role/tier filters, one after another --
// the "Test All Rewards" button. Each reward still gets its own dedicated
// "with reward" batch, but the no-reward baseline is only computed ONCE
// per role and reused across every tier and every reward of that role: a
// baseline trial never forces any reward at all, so it's the exact same
// experiment regardless of which reward or tier is being compared against
// it (see runAllPowerSimulations' identical reasoning).
async function runAllRewardSimulations({ runs = 100, aiDifficulty = 2, roleFilter = "all", tierFilter = "all" }, context, onProgress) {
  const rewards = getTestableRewards(roleFilter, tierFilter);
  const roles = [...new Set(rewards.map((r) => r.role))];

  const baselines = {};
  for (const role of roles) {
    baselines[role] = await runRewardBatch(
      { role, tier: null, rewardId: null, aiDifficulty, runs, withReward: false },
      context,
      (p) => onProgress?.({ phase: "baseline", role, ...p })
    );
  }

  const results = [];
  for (let i = 0; i < rewards.length; i++) {
    const { role, tier, rewardId, label, icon } = rewards[i];
    const withBatch = await runRewardBatch(
      { role, tier, rewardId, aiDifficulty, runs, withReward: true },
      context,
      (p) => onProgress?.({ phase: "reward", rewardIndex: i, totalRewards: rewards.length, role, tier, rewardId, label, ...p })
    );

    results.push(combineRewardBatches({ role, tier, rewardId, label, icon, runs, aiDifficulty }, withBatch, baselines[role]));
  }

  return results;
}

module.exports = {
  getRewardCatalog,
  getTestableRewards,
  runRewardSimulation,
  runAllRewardSimulations
};
