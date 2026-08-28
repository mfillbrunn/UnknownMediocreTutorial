// Regression tests for Daily Challenge round flow (REFINEMENT_SPEC
// sections 1 and 3): playMode-driven round counts/role order, and
// predefined-opening auto-resolution. Drives the real engine (createRoom
// -> applyAction, exactly like a real client) rather than reimplementing
// its logic, so these tests exercise the actual lobby/mode/simultaneous-
// phase wiring.
const assert = require("assert");
const { createRoom, rooms } = require("../core/rooms");
const { applyAction } = require("../core/applyAction");
const { computeAIActionForUser } = require("../core/ai/runAI");
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

// Runs whatever the AI would do right now, synchronously (bypassing
// runAI.js's real-game "feels like thinking" setTimeout) -- the same
// direct-call pattern core/simulation/runPowerSimulation.js already uses
// for synchronous trials.
function runAISync(room, roomId, context, aiUserId) {
  const actionFn = computeAIActionForUser(room, roomId, context, aiUserId);
  if (actionFn) actionFn();
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
  // -- "setter" ends after exactly one round, no Next Round --
  {
    const found = findDate(CANDIDATE_DATES, cfg => cfg.playMode === "setter");
    assert.ok(found, "test setup: need at least one 'setter' playMode date in the sample range");
    const context = makeContext();
    const { room, roomId } = startDailyRoom(found.date, "p-setter", context);
    assert.strictEqual(room.state.roundsTotal, 1, "playMode=setter must have roundsTotal=1");
    assert.strictEqual(room.state.mode instanceof DailyMode, true, "isDaily match must use DailyMode");
    assert.strictEqual(room.state.players["p-setter"].role, "setter", "playMode=setter must put the human in the Secretkeeper seat");
    assert.strictEqual(room.state.players.AI.role, "guesser", "playMode=setter must put the AI in the Guesser seat");

    applyAction(room, room.state, { type: "CONCEDE", userId: "AI" }, roomId, context);
    assert.strictEqual(room.state.canNextRound, false, "playMode=setter must never offer Next Round");
    assert.strictEqual(room.state.gameOverView, "match", "playMode=setter's single round must end the whole match");
  }

  // -- "guesser" ends after exactly one round, no Next Round --
  {
    const found = findDate(CANDIDATE_DATES, cfg => cfg.playMode === "guesser");
    assert.ok(found, "test setup: need at least one 'guesser' playMode date in the sample range");
    const context = makeContext();
    const { room, roomId } = startDailyRoom(found.date, "p-guesser", context);
    assert.strictEqual(room.state.roundsTotal, 1, "playMode=guesser must have roundsTotal=1");
    assert.strictEqual(room.state.players["p-guesser"].role, "guesser", "playMode=guesser must put the human in the Guesser seat");
    assert.strictEqual(room.state.players.AI.role, "setter", "playMode=guesser must put the AI in the Secretkeeper seat");

    applyAction(room, room.state, { type: "CONCEDE", userId: "p-guesser" }, roomId, context);
    assert.strictEqual(room.state.canNextRound, false, "playMode=guesser must never offer Next Round");
    assert.strictEqual(room.state.gameOverView, "match", "playMode=guesser's single round must end the whole match");
  }

  // -- "both" plays exactly two rounds and swaps roles --
  {
    const found = findDate(CANDIDATE_DATES, cfg => cfg.playMode === "both");
    assert.ok(found, "test setup: need at least one 'both' playMode date in the sample range");
    const context = makeContext();
    const { room, roomId } = startDailyRoom(found.date, "p-both", context);
    assert.strictEqual(room.state.roundsTotal, 2, "playMode=both must have roundsTotal=2");
    const round1HumanRole = room.state.players["p-both"].role;
    assert.strictEqual(round1HumanRole, found.cfg.firstRole, "round 1's human role must match the day's firstRole");

    applyAction(room, room.state, { type: "CONCEDE", userId: "p-both" }, roomId, context);
    assert.strictEqual(room.state.canNextRound, true, "playMode=both must offer Next Round after round 1");
    assert.strictEqual(room.state.gameOverView, "round", "playMode=both's round-1 end must be a round summary, not a match summary");

    applyAction(room, room.state, { type: "NEXT_ROUND", userId: "p-both" }, roomId, context);
    assert.strictEqual(room.state.roundIndex, 1, "NEXT_ROUND must advance to round index 1");
    const round2HumanRole = room.state.players["p-both"].role;
    assert.notStrictEqual(round2HumanRole, round1HumanRole, "round 2 must swap the human's role");

    applyAction(room, room.state, { type: "CONCEDE", userId: "p-both" }, roomId, context);
    assert.strictEqual(room.state.canNextRound, false, "playMode=both must not offer a 3rd round");
    assert.strictEqual(room.state.gameOverView, "match", "playMode=both's round-2 end must be the match summary");
  }

  // -- Predefined human GUESS opening resolves in exactly one history row --
  {
    const found = findDate(CANDIDATE_DATES, cfg => cfg.playMode !== "setter" && !!cfg.humanOpeningGuess);
    assert.ok(found, "test setup: need a date where a Guesser role has a predefined humanOpeningGuess");
    const context = makeContext();
    const { room } = startDailyRoom(found.date, "p-preguess", context);
    assert.strictEqual(room.state.phase, "normal", "a predefined opening guess must auto-resolve straight into the normal phase");
    assert.strictEqual(room.state.history.length, 1, "a predefined opening must create exactly one resolved history row");
    assert.strictEqual(room.state.guessCount, 1, "the auto-resolved opening must count as exactly one guess");
    assert.strictEqual(room.state.history[0].guess, found.cfg.humanOpeningGuess, "the resolved guess must be the predefined word");
    assert.strictEqual(room.state.history[0].finalSecret, found.cfg.aiOpeningSecret, "the AI must have used its fixed opening secret");
  }

  // -- Predefined human SECRET opening resolves in exactly one history row --
  {
    const found = findDate(CANDIDATE_DATES, cfg => cfg.playMode !== "guesser" && !!cfg.humanOpeningSecret);
    assert.ok(found, "test setup: need a date where a Secretkeeper role has a predefined humanOpeningSecret");
    const context = makeContext();
    const { room } = startDailyRoom(found.date, "p-presecret", context);
    assert.strictEqual(room.state.phase, "normal", "a predefined opening secret must auto-resolve straight into the normal phase");
    assert.strictEqual(room.state.history.length, 1, "a predefined opening must create exactly one resolved history row");
    assert.strictEqual(room.state.history[0].finalSecret, found.cfg.humanOpeningSecret, "the resolved secret must be the predefined word");
    assert.strictEqual(room.state.history[0].guess, found.cfg.aiOpeningGuess, "the AI must have used its fixed opening guess");
  }

  // -- Freely chosen human opening still uses the AI's fixed opening word --
  {
    const found = findDate(
      CANDIDATE_DATES,
      cfg => cfg.playMode === "both" && !cfg.humanOpeningGuess && !cfg.humanOpeningSecret
    );
    assert.ok(found, "test setup: need a 'both' date where neither human opening word is predefined");
    const context = makeContext();
    const { room, roomId } = startDailyRoom(found.date, "p-free", context);
    assert.strictEqual(room.state.phase, "simultaneous", "an unpredefined opening must NOT auto-resolve -- the player chooses freely");
    assert.strictEqual(room.state.history.length, 0, "no history row yet -- nothing has been submitted");

    const humanRole = room.state.players["p-free"].role;
    if (humanRole === "guesser") {
      // Human freely submits a guess; the AI Secretkeeper must still use
      // its fixed daily secret, not a normal AI-picked one.
      applyAction(room, room.state, { type: "SUBMIT_GUESS", userId: "p-free", guess: S[0] }, roomId, context);
      runAISync(room, roomId, context, "AI");
    } else {
      applyAction(room, room.state, { type: "SET_SECRET_NEW", userId: "p-free", secret: S[0] }, roomId, context);
      runAISync(room, roomId, context, "AI");
    }

    assert.strictEqual(room.state.history.length, 1, "the freely chosen opening must still resolve to one history row");
    const expectedAiWord = humanRole === "guesser" ? found.cfg.aiOpeningSecret : found.cfg.aiOpeningGuess;
    const actualAiWord = humanRole === "guesser" ? room.state.history[0].finalSecret : room.state.history[0].guess;
    assert.strictEqual(actualAiWord, expectedAiWord, "the AI's opening move must still be the day's fixed word even when the human chose freely");
  }

  console.log("PASS dailyChallengeRoundFlow: setter/guesser end after 1 round with no Next Round, both plays 2 rounds and swaps roles, predefined openings auto-resolve to exactly one history row each, a freely-chosen opening still pins the AI's fixed word");
}

module.exports = { run };

if (require.main === module) {
  run();
}
