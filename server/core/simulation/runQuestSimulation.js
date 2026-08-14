// core/simulation/runQuestSimulation.js
//
// Developer tool: companion to runPowerSimulation.js for the guesser Quest
// system (server/powers/powers/questServer.js). Runs many single-round
// trials with one quest type forced onto the guesser seat and every other
// power stripped from both sides, so nothing but the quest itself can be
// responsible for a completion. Used by the "Test All Quests" button on
// the Simulation screen.
//
// Unlike powers, quests have no natural "with/without" baseline -- every
// guesser always has exactly one for the whole match. What varies is which
// TYPE they got, so the metric here is completion rate: of N trials forced
// onto a given type, what fraction end with the guesser actually claiming
// the full green reward (state.powers.quest.used, resultColor === "green",
// not claimedEarly) versus the yellow early-claim trade versus never
// completing it before the round ended.

const { rooms, createRoom, addAIPlayer } = require("../rooms");
const { applyAction } = require("../applyAction");
const { computeAIActionForUser } = require("../ai/runAI");
const { QUEST_TYPES } = require("../../powers/powers/questServer");

const SEAT_A = "simqA"; // always the guesser -- see runSingleQuestTrial
const SEAT_B = "AI";
// Same generous ~10x margin over a typical round as runPowerSimulation.js's
// identical cap, for the identical reason.
const MAX_TICKS_PER_TRIAL = 60;

function yieldEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Forces this match's quest type the same way Draft Mode/Daily Challenge do
// (state._dailyQuestType, read by lobby.js's PLAYER_READY handler and
// passed into CompetitiveMode.onLobbyReady's guesserQuest param), and
// strips every other power from both sides via the same devMode override
// runPowerSimulation.js's configurePowers uses -- isolates the quest as the
// only thing that can produce a completion.
function configureQuestRoom(state, questType) {
  state.devMode = true;
  state._devSetterPowers = [];
  state._devGuesserPowers = [];
  state._dailyQuestType = questType;
}

// Runs ONE trial round with seat A forced onto the guesser seat holding
// the given quest type, seat B ("AI") setting with no powers. Returns
// { completed, claimedEarly, guessCount } or null if the round somehow
// didn't finish within the safety cap (excluded trials shrink the sample
// size slightly rather than biasing it -- see runPowerSimulation.js's
// identical handling).
function runSingleQuestTrial({ questType, aiDifficulty }, context) {
  const fakeSocket = { id: "simq_" + Math.random().toString(36).slice(2), join() {} };
  const roomId = createRoom(fakeSocket, SEAT_A);
  const room = rooms[roomId];

  try {
    addAIPlayer(room, aiDifficulty);
    room.state.aiDifficulty = aiDifficulty;

    applyAction(room, room.state, { type: "SET_DRAFT_MODE", draftMode: false, userId: SEAT_A }, roomId, context);

    // Room creation defaults the host (seat A) to setter -- quests only
    // ever belong to the guesser, so always flip.
    applyAction(room, room.state, { type: "SWITCH_ROLES", userId: SEAT_A }, roomId, context);

    configureQuestRoom(room.state, questType);

    applyAction(room, room.state, { type: "PLAYER_READY", userId: SEAT_A }, roomId, context);

    let ticks = 0;
    while (!room.state.gameOver && ticks < MAX_TICKS_PER_TRIAL) {
      const aAction = computeAIActionForUser(room, roomId, context, SEAT_A);
      if (aAction) aAction();

      if (!room.state.gameOver) {
        const bAction = computeAIActionForUser(room, roomId, context, SEAT_B);
        if (bAction) bAction();
      }

      ticks++;
    }

    if (!room.state.gameOver) return null;

    const q = room.state.powers?.quest;
    const completed = !!q?.used && q.resultColor === "green" && !q.claimedEarly;
    const claimedEarly = !!q?.used && !!q.claimedEarly;
    return { completed, claimedEarly, guessCount: room.state.guessCount };
  } finally {
    delete rooms[roomId];
  }
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

async function runQuestBatch({ questType, aiDifficulty, runs }, context, onProgress) {
  const trials = [];
  for (let i = 0; i < runs; i++) {
    const result = runSingleQuestTrial({ questType, aiDifficulty }, context);
    if (result) trials.push(result);
    if (i % 5 === 4) await yieldEventLoop();
    onProgress?.({ completed: i + 1, total: runs });
  }
  return trials;
}

function combineQuestStats(questType, runs, aiDifficulty, trials) {
  const completed = trials.filter((t) => t.completed).length;
  const claimedEarly = trials.filter((t) => t.claimedEarly).length;
  const completedGuessCounts = trials.filter((t) => t.completed).map((t) => t.guessCount);

  return {
    questType,
    runs,
    aiDifficulty,
    completedTrials: trials.length,
    completed,
    claimedEarly,
    neverCompleted: trials.length - completed - claimedEarly,
    completionRate: trials.length ? completed / trials.length : null,
    avgGuessesWhenCompleted: avg(completedGuessCounts)
  };
}

// Runs `runs` trials for a single quest type. onProgress(payload) fires
// periodically so the caller can stream status back to the client; it's
// optional.
async function runQuestSimulation({ questType, runs = 100, aiDifficulty = 2 }, context, onProgress) {
  if (!QUEST_TYPES.includes(questType)) {
    throw new Error("questType must be one of QUEST_TYPES");
  }

  const trials = await runQuestBatch({ questType, aiDifficulty, runs }, context, onProgress);
  return combineQuestStats(questType, runs, aiDifficulty, trials);
}

// Tests every quest type one after another, saving each result to Supabase
// as it finishes -- the "Test All Quests" button. Mirrors
// runAllPowerSimulations's shape, just without a shared baseline batch
// (there's nothing to share -- each quest type's trials are independent).
async function runAllQuestSimulations({ runs = 100, aiDifficulty = 2 }, context, userId, onProgress) {
  const results = [];

  for (let i = 0; i < QUEST_TYPES.length; i++) {
    const questType = QUEST_TYPES[i];
    const trials = await runQuestBatch(
      { questType, aiDifficulty, runs },
      context,
      (p) => onProgress?.({ questIndex: i, totalQuests: QUEST_TYPES.length, questType, ...p })
    );

    const stats = combineQuestStats(questType, runs, aiDifficulty, trials);

    let saved = null;
    try {
      saved = await saveQuestSimulation(stats, context, userId);
    } catch (saveErr) {
      console.error(`Quest simulation save failed for ${questType}:`, saveErr);
    }

    results.push({ stats, saved: !!saved });
  }

  return results;
}

async function saveQuestSimulation(stats, context, userId) {
  const { supabase } = context;
  const { data, error } = await supabase
    .from("quest_simulations")
    .insert({
      quest_type: stats.questType,
      runs: stats.runs,
      ai_difficulty: stats.aiDifficulty,
      completed_trials: stats.completedTrials,
      completed: stats.completed,
      claimed_early: stats.claimedEarly,
      never_completed: stats.neverCompleted,
      completion_rate: stats.completionRate,
      avg_guesses_when_completed: stats.avgGuessesWhenCompleted,
      created_by: userId || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  runQuestSimulation,
  runAllQuestSimulations,
  saveQuestSimulation
};
