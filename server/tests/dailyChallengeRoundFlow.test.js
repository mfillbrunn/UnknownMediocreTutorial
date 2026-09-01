// Regression tests for Daily Challenge round flow: every day now always
// plays both sides (2 rounds, role swap) with BOTH rounds' opening word
// predefined for the human, matching the AI's own fixed opening every
// time. Drives the real engine (createRoom -> applyAction, exactly like a
// real client) rather than reimplementing its logic, so these tests
// exercise the actual lobby/mode/simultaneous-phase wiring.
const assert = require("assert");
const { createRoom, rooms } = require("../core/rooms");
const { applyAction } = require("../core/applyAction");
const { getDailyConfig } = require("../utils/dailyConfig");
const DailyMode = require("../core/modes/dailyMode");

const S = ["APPLE", "GRAPE", "MANGO", "PEACH", "LEMON", "BERRY", "MELON", "CRANE", "SLATE", "TRACE", "STARE", "PLAYA", "CHALK", "RAMEN", "WREAK", "OVARY", "HOUSE", "MOUSE", "LOUSE", "ROUSE"];
const G = S;

function makeContext() {
  const io = { to: () => ({ emit: () => {} }) };
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

function findDate(dates, predicate) {
  for (const date of dates) {
    const cfg = getDailyConfig(date, S, G);
    if (predicate(cfg)) return { date, cfg };
  }
  return null;
}

const CANDIDATE_DATES = Array.from({ length: 90 }, (_, i) =>
  `2029-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`
);

function run() {
  // -- Every day plays exactly two rounds and swaps roles --
  {
    const found = findDate(CANDIDATE_DATES, () => true);
    assert.ok(found, "test setup: need at least one date in the sample range");
    assert.strictEqual(found.cfg.playMode, "both", "playMode must always be 'both' now");
    const context = makeContext();
    const { room, roomId } = startDailyRoom(found.date, "p-both", context);
    assert.strictEqual(room.state.roundsTotal, 2, "every daily challenge must have roundsTotal=2");
    assert.strictEqual(room.state.mode instanceof DailyMode, true, "isDaily match must use DailyMode");
    const round1HumanRole = room.state.players["p-both"].role;
    assert.strictEqual(round1HumanRole, found.cfg.firstRole, "round 1's human role must match the day's firstRole");

    applyAction(room, room.state, { type: "CONCEDE", userId: "p-both" }, roomId, context);
    assert.strictEqual(room.state.canNextRound, true, "round 1's end must offer Next Round");
    assert.strictEqual(room.state.gameOverView, "round", "round 1's end must be a round summary, not a match summary");

    applyAction(room, room.state, { type: "NEXT_ROUND", userId: "p-both" }, roomId, context);
    assert.strictEqual(room.state.roundIndex, 1, "NEXT_ROUND must advance to round index 1");
    const round2HumanRole = room.state.players["p-both"].role;
    assert.notStrictEqual(round2HumanRole, round1HumanRole, "round 2 must swap the human's role");

    applyAction(room, room.state, { type: "CONCEDE", userId: "p-both" }, roomId, context);
    assert.strictEqual(room.state.canNextRound, false, "round 2 must not offer a 3rd round");
    assert.strictEqual(room.state.gameOverView, "match", "round 2's end must be the match summary");
  }

  // -- Round 1's predefined opening (Guesser role) resolves in exactly one
  // history row, straight into the normal phase, no free choice offered --
  {
    const found = findDate(CANDIDATE_DATES, cfg => cfg.firstRole === "guesser");
    assert.ok(found, "test setup: need a date where the human opens round 1 as Guesser");
    assert.ok(found.cfg.humanOpeningGuess, "every day must predefine humanOpeningGuess now");
    const context = makeContext();
    const { room } = startDailyRoom(found.date, "p-preguess", context);
    assert.strictEqual(room.state.phase, "normal", "a predefined opening guess must auto-resolve straight into the normal phase");
    assert.strictEqual(room.state.history.length, 1, "a predefined opening must create exactly one resolved history row");
    assert.strictEqual(room.state.guessCount, 1, "the auto-resolved opening must count as exactly one guess");
    assert.strictEqual(room.state.history[0].guess, found.cfg.humanOpeningGuess, "the resolved guess must be the predefined word");
    assert.strictEqual(room.state.history[0].finalSecret, found.cfg.aiOpeningSecret, "the AI must have used its fixed opening secret");
  }

  // -- Round 1's predefined opening (Secretkeeper role) resolves in exactly
  // one history row --
  {
    const found = findDate(CANDIDATE_DATES, cfg => cfg.firstRole === "setter");
    assert.ok(found, "test setup: need a date where the human opens round 1 as Secretkeeper");
    assert.ok(found.cfg.humanOpeningSecret, "every day must predefine humanOpeningSecret now");
    const context = makeContext();
    const { room } = startDailyRoom(found.date, "p-presecret", context);
    assert.strictEqual(room.state.phase, "normal", "a predefined opening secret must auto-resolve straight into the normal phase");
    assert.strictEqual(room.state.history.length, 1, "a predefined opening must create exactly one resolved history row");
    assert.strictEqual(room.state.history[0].finalSecret, found.cfg.humanOpeningSecret, "the resolved secret must be the predefined word");
    assert.strictEqual(room.state.history[0].guess, found.cfg.aiOpeningGuess, "the AI must have used its fixed opening guess");
  }

  // -- Round 2's opening (the OTHER role, after the swap) is ALSO
  // predefined and auto-resolves -- this is the exact gap that used to
  // leave round 2 as a free choice even on a day that pinned round 1. --
  {
    const found = findDate(CANDIDATE_DATES, () => true);
    assert.ok(found, "test setup: need at least one date in the sample range");
    const context = makeContext();
    const { room, roomId } = startDailyRoom(found.date, "p-round2", context);
    const round1Role = room.state.players["p-round2"].role;

    applyAction(room, room.state, { type: "CONCEDE", userId: "p-round2" }, roomId, context);
    applyAction(room, room.state, { type: "NEXT_ROUND", userId: "p-round2" }, roomId, context);

    const round2Role = room.state.players["p-round2"].role;
    assert.notStrictEqual(round2Role, round1Role, "round 2 must swap the human's role");
    assert.strictEqual(room.state.phase, "normal", "round 2's predefined opening must also auto-resolve straight into the normal phase");
    assert.strictEqual(room.state.history.length, 1, "round 2 must start with exactly one resolved history row, same as round 1 did");

    const expectedWord = round2Role === "guesser" ? found.cfg.humanOpeningGuess : found.cfg.humanOpeningSecret;
    const actualWord = round2Role === "guesser" ? room.state.history[0].guess : room.state.history[0].finalSecret;
    assert.strictEqual(actualWord, expectedWord, "round 2 must resolve using that role's own predefined word, not a free choice");
  }

  console.log("PASS dailyChallengeRoundFlow: every day plays 2 rounds and swaps roles, and BOTH rounds' opening word is predefined and auto-resolves to exactly one history row");
}

module.exports = { run };

if (require.main === module) {
  run();
}
