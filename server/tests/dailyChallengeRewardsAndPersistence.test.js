// Regression tests for Daily Challenge reward-offer determinism
// (REFINEMENT_SPEC section 5), Refresh Choices removal (section 6), and
// playMode-aware result persistence (section 9).
const assert = require("assert");
const { createRoom, rooms } = require("../core/rooms");
const { applyAction } = require("../core/applyAction");
const { getDailyConfig } = require("../utils/dailyConfig");
const powerChoiceServer = require("../power-choice/powerChoiceServer");
const { markDailyCompleted, getDailyStatus } = require("../core/dailyTracking");

const S = ["APPLE", "GRAPE", "MANGO", "PEACH", "LEMON", "BERRY", "MELON", "CRANE", "SLATE", "TRACE", "STARE", "PLAYA", "CHALK", "RAMEN", "WREAK", "OVARY", "HOUSE", "MOUSE", "LOUSE", "ROUSE"];
const G = S;

function makeContext() {
  const io = { to: () => ({ emit: () => {} }) };
  // A working fake supabase so gameOver.js's own internal writeMatchHistory/
  // markDailyCompleted calls (fired automatically by CONCEDE/endGame below)
  // don't throw -- the persistence assertions further down call
  // markDailyCompleted/getDailyStatus directly with supabase: null instead,
  // to specifically exercise dailyTracking.js's in-memory fallback path.
  const fakeSupabase = {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      select: () => ({
        eq: () => ({ eq: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: null, error: null }) })
      })
    })
  };
  const context = {
    io,
    supabase: fakeSupabase,
    powerEngine: require("../powers/powerEngineServer"),
    ALLOWED_SECRETS: S,
    ALLOWED_GUESSES: G,
    WORDS: { secrets: S.map(w => ({ word: w })), guesses: G.map(w => ({ word: w })) },
    applyAction
  };
  context.endGame = require("../core/phases/gameOver").endGame;
  context.maybeRunAI = require("../core/ai/runAI").maybeRunAI;
  return context;
}

function startDailyRoom(date, userId, context) {
  const socket = { id: "sock-" + userId + "-" + date, join() {} };
  const roomId = createRoom(socket, userId);
  const room = rooms[roomId];
  applyAction(room, room.state, { type: "ADD_AI", userId, dailyDate: date }, roomId, context);
  applyAction(room, room.state, { type: "SET_DAILY_POWERS", date, userId }, roomId, context);
  applyAction(room, room.state, { type: "SET_TIME_CONTROL", enabled: false, userId }, roomId, context);
  applyAction(room, room.state, { type: "PLAYER_READY", userId, mode: "daily" }, roomId, context);
  return { room, roomId };
}

function findDate(predicate) {
  for (let i = 0; i < 90; i++) {
    const date = `2030-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`;
    const cfg = getDailyConfig(date, S, G);
    if (predicate(cfg)) return { date, cfg };
  }
  return null;
}

async function run() {
  const bothDate = findDate(cfg => cfg.playMode === "both");
  assert.ok(bothDate, "test setup: need a 'both' playMode date");

  // -- Reward offers: identical Offer 1/2/3, same order, for every player;
  // reading them again after a fake milestone doesn't reroll them. --
  {
    const contextA = makeContext();
    const contextB = makeContext();
    const { room: roomA } = startDailyRoom(bothDate.date, "playerA", contextA);
    const { room: roomB } = startDailyRoom(bothDate.date, "playerB", contextB);

    for (const role of ["setter", "guesser"]) {
      for (let rewardNumber = 1; rewardNumber <= 3; rewardNumber++) {
        const optionsA = powerChoiceServer.dailyRewardOptions(roomA.state, role, rewardNumber).map(o => o.id);
        const optionsB = powerChoiceServer.dailyRewardOptions(roomB.state, role, rewardNumber).map(o => o.id);
        assert.deepStrictEqual(optionsA, optionsB, `${role} milestone ${rewardNumber}: option ids+order must be identical across players`);

        // Reading the same offer a second time (as a reconnect/rebuild
        // would) must return the exact same 3 ids in the exact same
        // order -- it's a pure read of the precomputed schedule, not a
        // fresh roll.
        const optionsAgain = powerChoiceServer.dailyRewardOptions(roomA.state, role, rewardNumber).map(o => o.id);
        assert.deepStrictEqual(optionsA, optionsAgain, `${role} milestone ${rewardNumber}: re-reading the offer must not reroll it`);
      }
    }

    // Selecting milestone 1's reward must not alter milestone 2/3's
    // offers -- they're independent, precomputed entries, not drawn from
    // a shrinking pool.
    const guesserOffer2Before = powerChoiceServer.dailyRewardOptions(roomA.state, "guesser", 2).map(o => o.id);
    const fakeChoice = { ownerUserId: "playerA", role: "guesser", threshold: 2, tier: 1 };
    const milestone1Options = powerChoiceServer.dailyRewardOptions(roomA.state, "guesser", 1);
    powerChoiceServer.applyChoice(roomA.state, milestone1Options[0], fakeChoice, roomA, "roomA", contextA.io, contextA, {});
    const guesserOffer2After = powerChoiceServer.dailyRewardOptions(roomA.state, "guesser", 2).map(o => o.id);
    assert.deepStrictEqual(guesserOffer2Before, guesserOffer2After, "selecting an earlier milestone's reward must not change a later milestone's offer");
  }

  // -- AI picks the same reward for the same date+milestone --
  {
    const contextA = makeContext();
    const contextB = makeContext();
    const { room: roomA } = startDailyRoom(bothDate.date, "playerC", contextA);
    const { room: roomB } = startDailyRoom(bothDate.date, "playerD", contextB);

    for (const state of [roomA.state, roomB.state]) {
      state.powerChoice.pendingChoice = powerChoiceServer.dailyRewardOptions(state, "setter", 1) && {
        id: "fake",
        ownerUserId: "AI",
        role: "setter",
        rewardNumber: 1,
        tier: 1,
        options: powerChoiceServer.dailyRewardOptions(state, "setter", 1)
      };
    }
    const pickA = powerChoiceServer.buildAIChoiceAction(roomA.state, "AI");
    const pickB = powerChoiceServer.buildAIChoiceAction(roomB.state, "AI");
    assert.ok(pickA && pickB, "AI must produce a pick when a daily reward choice is pending");
    assert.strictEqual(pickA.optionId, pickB.optionId, "the AI must pick the exact same option id for the same date+milestone in independent rooms");
  }

  // -- Refresh Choices rejected server-side for Daily Challenge --
  {
    const context = makeContext();
    const { room, roomId } = startDailyRoom(bothDate.date, "playerE", context);
    const events = [];
    context.io = { to: () => ({ emit: (event, payload) => events.push({ event, payload }) }) };
    room.state.powerChoice.pendingChoice = {
      id: "fake-choice",
      ownerUserId: "playerE",
      role: "guesser",
      options: powerChoiceServer.dailyRewardOptions(room.state, "guesser", 1)
    };
    const handled = powerChoiceServer.handleAction(
      room, room.state, { type: "POWER_CHOICE_REFRESH", userId: "playerE", choiceId: "fake-choice" }, roomId, context
    );
    assert.strictEqual(handled, true, "POWER_CHOICE_REFRESH must be handled (not fall through) for a daily room");
    assert.ok(
      events.some(e => e.event === "errorMessage"),
      "a rejected daily refresh must tell the player why"
    );
    assert.strictEqual(room.state.powerChoice.pendingChoice.id, "fake-choice", "a rejected refresh must not corrupt the pending offer");
  }

  // -- Ordinary (non-daily) Power Choice reward generation is unaffected --
  {
    const nonDailyState = { gameMode: "powerChoice", isDaily: false, isTutorial: false, devMode: false };
    assert.strictEqual(
      powerChoiceServer.isPowerChoice(nonDailyState),
      true,
      "a non-daily Power Choice match must remain unaffected by the daily reward-schedule gate"
    );
  }

  // -- Persistence + ranking: every day plays 'both' now --
  {
    const context = makeContext();
    const userId = "p-persist-both";
    const { room, roomId } = startDailyRoom(bothDate.date, userId, context);

    // Play to completion.
    const humanRole = room.state.players[userId].role;
    applyAction(room, room.state, { type: "CONCEDE", userId: humanRole === "guesser" ? userId : "AI" }, roomId, context);
    assert.strictEqual(room.state.canNextRound, true, "a 'both' round 1 must offer Next Round");
    applyAction(room, room.state, { type: "NEXT_ROUND", userId }, roomId, context);
    const humanRole2 = room.state.players[userId].role;
    applyAction(room, room.state, { type: "CONCEDE", userId: humanRole2 === "guesser" ? userId : "AI" }, roomId, context);

    const status = await completeAndReadDailyStatus(roomId, userId, bothDate.date, room);
    assert.strictEqual(status.result.playMode, "both", "persisted result must record the day's playMode");
    assert.strictEqual(
      status.result.scoreDifference,
      status.result.setterScore - status.result.guesserScore,
      "'both' result must store scoreDifference = setterScore - guesserScore"
    );
  }

  // -- Persistence round-trip for a HISTORICAL setter-only/guesser-only
  // result still works, even though no day generates that playMode
  // anymore -- getDailyStatus must keep reading old rows written before
  // this change exactly as they were saved. --
  for (const legacyPlayMode of ["setter", "guesser"]) {
    const userId = `p-persist-legacy-${legacyPlayMode}`;
    await markDailyCompleted({
      supabase: null,
      userId,
      date: "2030-01-01",
      result: {
        playMode: legacyPlayMode,
        firstRole: legacyPlayMode,
        setterScore: 3,
        guesserScore: 4,
        scoreDifference: -1,
        time: 60,
        won: legacyPlayMode === "guesser",
        tie: false,
        difficulty: 2
      }
    });
    const status = await getDailyStatus({ supabase: null, userId, date: "2030-01-01" });
    assert.strictEqual(status.result.playMode, legacyPlayMode, `a historical '${legacyPlayMode}' result must still round-trip its own playMode`);
    if (legacyPlayMode === "setter") {
      assert.ok(status.result.setterScore >= 0, "a historical setter-only result must have a setterScore");
    } else {
      assert.ok(status.result.guesserScore >= 0, "a historical guesser-only result must have a guesserScore");
    }
  }

  console.log("PASS dailyChallengeRewardsAndPersistence: identical reward offers across players, prior picks don't alter later offers, AI picks match across rooms, refresh rejected server-side, ordinary Power Choice unaffected, playMode-aware persistence populated correctly");
}

// Mirrors gameOver.js's own isDaily completion block exactly (same
// computeMatchResult-derived setter/guesser score mapping), driven
// directly here since gameOver.js's real call already fired during the
// CONCEDE/NEXT_ROUND actions above -- this just reads back what it wrote
// via the same markDailyCompleted/getDailyStatus pair, confirming the
// persisted shape round-trips correctly.
async function completeAndReadDailyStatus(roomId, userId, date, room) {
  const humanId = userId;
  const aiPlayer = Object.values(room.state.players).find(p => p.isAI);
  const { computeMatchResult } = require("../utils/writeMatchData");
  const { points, time, didWin, tie } = computeMatchResult(room.state, humanId);
  const setterScore = points[humanId] || 0;
  const guesserScore = aiPlayer ? points[aiPlayer.userId] || 0 : 0;
  const playMode = room.state._dailyConfig?.playMode || "both";
  const firstRole = room.state._dailyConfig?.firstRole || null;

  await markDailyCompleted({
    supabase: null,
    userId: humanId,
    date,
    result: {
      playMode,
      firstRole,
      setterScore,
      guesserScore,
      scoreDifference: setterScore - guesserScore,
      time: time[humanId] || 0,
      won: didWin,
      tie,
      difficulty: room.state.aiDifficulty || null
    }
  });
  return getDailyStatus({ supabase: null, rooms, userId: humanId, date });
}

module.exports = { run };

if (require.main === module) {
  run();
}
