// core/simulation/runPowerSimulation.js
//
// Developer tool: pits two identically-tuned AI opponents against each
// other many times, giving exactly one power to one side, to measure how
// much that power actually moves the outcome. Used from the "Simulation"
// screen behind the Developer button.
//
// Each trial is a single round (not a full role-swapped match) — the
// power stays on ONE seat for the whole trial, in the role it belongs to.
// A full match's role-swap would hand the SAME power pool to both players
// (one round each), which defeats the point of an asymmetric test.
//
// Runs entirely server-side via the real game engine (createRoom,
// applyAction, the real genericAI logic through
// core/ai/runAI.js's computeAIActionForUser) — same code path real games
// use, just driven synchronously with no artificial "thinking" delay, and
// yielding the event loop periodically so a long run doesn't stall other
// players' live games.

const { rooms, createRoom, addAIPlayer } = require("../rooms");
const { applyAction } = require("../applyAction");
const { computeAIActionForUser } = require("../ai/runAI");

const SEAT_A = "simA";
const SEAT_B = "AI";
// A converging round normally takes single-digit guesses; 60 ticks is a
// generous ~10x margin. Real rounds do occasionally run very long (rare,
// especially with masking powers like blindSpot reducing the guesser's
// info) — isConsistentWithHistory is O(secrets * history length) per pick,
// so letting those run all the way to a huge cap burns increasingly
// expensive scans for a trial that's excluded from the stats anyway.
// Bailing out early is cheap: excluded trials don't bias the aggregate,
// they just shrink the sample size by roughly 1%.
const MAX_TICKS_PER_TRIAL = 60;

function yieldEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Setting state.activePowers/initialPowers directly here does NOT stick —
// lobby.js's PLAYER_READY handler (the "both players ready, start the
// match" path) always overwrites both from a fresh SETTER_POWERS/
// GUESSER_POWERS random pick (2 of each by default) UNLESS state.devMode
// is on with state._devSetterPowers/_devGuesserPowers set, which is the
// one path it treats as an explicit override (see lobby.js:394-408 — the
// same mechanism the "Dev Mode" power-picker modal already uses via the
// SET_DEV_POWERS action). Route through that instead of activePowers
// directly, or every trial silently gets random extra powers on both
// sides on top of the one actually under test.
function configurePowers(state, powerId, powerRole, withPower) {
  state.devMode = true;
  state._devSetterPowers = withPower && powerRole === "setter" ? [powerId] : [];
  state._devGuesserPowers = withPower && powerRole === "guesser" ? [powerId] : [];
}

// Runs ONE trial round: seat A always holds the power's own role (and the
// power itself, when withPower is true); seat B ("AI") plays the opposite
// role with no powers active. Returns the round's guessCount (the same
// metric real matches score with — see core/phases/gameOver.js), or null
// if the round somehow didn't finish within the safety cap.
function runSingleTrial({ powerId, powerRole, aiDifficulty, withPower }, context) {
  const fakeSocket = { id: "sim_" + Math.random().toString(36).slice(2), join() {} };
  const roomId = createRoom(fakeSocket, SEAT_A);
  const room = rooms[roomId];

  try {
    addAIPlayer(room, aiDifficulty);
    room.state.aiDifficulty = aiDifficulty;

    applyAction(room, room.state, { type: "SET_DRAFT_MODE", draftMode: false, userId: SEAT_A }, roomId, context);

    // Room creation defaults the host (seat A) to setter — flip if the
    // power under test belongs to the guesser.
    if (powerRole === "guesser") {
      applyAction(room, room.state, { type: "SWITCH_ROLES", userId: SEAT_A }, roomId, context);
    }

    configurePowers(room.state, powerId, powerRole, withPower);

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
    return room.state.guessCount;
  } finally {
    delete rooms[roomId];
  }
}

// Runs `runs` trials with the power active, then `runs` more as a baseline
// with no power at all — same AI difficulty, same seat roles, throughout.
// onProgress(payload) fires periodically so the caller can stream status
// back to the client; it's optional.
async function runPowerSimulation({ powerId, powerRole, runs = 100, aiDifficulty = 2 }, context, onProgress) {
  if (!powerId) throw new Error("powerId is required");
  if (powerRole !== "setter" && powerRole !== "guesser") {
    throw new Error("powerRole must be 'setter' or 'guesser'");
  }

  const withPower = [];
  const withoutPower = [];

  for (let i = 0; i < runs; i++) {
    const result = runSingleTrial({ powerId, powerRole, aiDifficulty, withPower: true }, context);
    if (result != null) withPower.push(result);
    if (i % 5 === 4) await yieldEventLoop();
    onProgress?.({ stage: "with_power", completed: i + 1, total: runs });
  }

  for (let i = 0; i < runs; i++) {
    const result = runSingleTrial({ powerId, powerRole, aiDifficulty, withPower: false }, context);
    if (result != null) withoutPower.push(result);
    if (i % 5 === 4) await yieldEventLoop();
    onProgress?.({ stage: "without_power", completed: i + 1, total: runs });
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  return {
    powerId,
    powerRole,
    runs,
    aiDifficulty,
    completedWithPower: withPower.length,
    completedWithoutPower: withoutPower.length,
    avgWithPower: avg(withPower),
    avgWithoutPower: avg(withoutPower),
    minWithPower: withPower.length ? Math.min(...withPower) : null,
    maxWithPower: withPower.length ? Math.max(...withPower) : null,
    minWithoutPower: withoutPower.length ? Math.min(...withoutPower) : null,
    maxWithoutPower: withoutPower.length ? Math.max(...withoutPower) : null,
    rawWithPower: withPower,
    rawWithoutPower: withoutPower
  };
}

async function savePowerSimulation(stats, context, userId) {
  const { supabase } = context;
  const { data, error } = await supabase
    .from("power_simulations")
    .insert({
      power_id: stats.powerId,
      power_role: stats.powerRole,
      runs: stats.runs,
      ai_difficulty: stats.aiDifficulty,
      avg_guesses_with_power: stats.avgWithPower,
      avg_guesses_without_power: stats.avgWithoutPower,
      min_guesses_with_power: stats.minWithPower,
      max_guesses_with_power: stats.maxWithPower,
      min_guesses_without_power: stats.minWithoutPower,
      max_guesses_without_power: stats.maxWithoutPower,
      raw_with_power: stats.rawWithPower,
      raw_without_power: stats.rawWithoutPower,
      created_by: userId || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = { runPowerSimulation, savePowerSimulation };
