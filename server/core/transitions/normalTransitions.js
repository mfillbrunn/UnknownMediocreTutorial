const { endGame } = require("../phases/gameOver");
const { emitRoomState } = require("../rooms");
const { finalizeFeedback } = require("../../game-engine/finalizeFeedback");
const { addIncrement, resetRoundTimer } = require("../../utils/Timer");
const { clearForceTimer, registerForceTimer } = require("../../utils/forceTimer");

function transitionAfterGuess({ room, state, guess, roomId, context, io }) {
  const assassin = state.powers.assassinWord;

  // Assassin hit -> game over
  if (assassin && guess === assassin.toUpperCase()) {
    state.powers.assassinWordassassinated = true;
    pushWinEntry(state, state.secret);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return "gameOver";
  }

  // Correct guess -> game over
  if (guess === state.secret) {
    pushWinEntry(state, guess);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return "gameOver";
  }

  // Otherwise -> setter's turn
  state.pendingGuess = guess;
  io.to(roomId).emit("guessSubmitted");

  // Guess-only power evaluation (e.g. Field Report) — before
  // clearRoundState wipes round-scoped power flags and before the
  // setter's upcoming Keep/New decision, so any GREEN extraConstraint
  // granted here already binds their choice via isConsistentWithHistory.
  context.powerEngine.onGuessSubmitted(state, guess, roomId, io);

  // The guesser just acted, resolving any Force Timer that was pressuring
  // them -- stop its ticking interval before the setter's turn begins.
  clearForceTimer(roomId, state);

  clearRoundState(state, "guesser");

  context.powerEngine.turnStart(state, state.turn, roomId, io);
  emitRoomState(roomId, room, io);
  return "continue";
}

function transitionAfterSecret({ room, state, secret, roomId, context, io }) {
  state.secret = secret;
  state.simultaneousAllWrong = false;
  if (state.pendingGuess === secret) {
    pushWinEntry(state, secret);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return "gameOver";
  }

  io.to(roomId).emit("secretPlanted");
  finalizeFeedback(state, context.powerEngine, roomId, room, io);
  clearRoundState(state, "setter");

  if (state.powers.forceTimerArmed) {
    startForceTimer(roomId, room, state, io, context);
  }

  context.powerEngine.turnStart(state, state.turn, roomId, io);
  emitRoomState(roomId, room, io);
  return "continue";
}

/* ---------- helpers ---------- */

function advanceTimer(state, userId) {
  if (state.timeControl.mode === "chess") {
    addIncrement(state, userId);
  } else if (state.timeControl.mode === "round") {
    resetRoundTimer(state);
  }
}

const ROUND_SCOPED_ACTIVE_POWERS = new Set([
  "freezeActive",
  "stealthGuessActive",
  "confuseColorsActive",
  "magicModeActive",
  "countOnlyActive",
  "nonsenseActive",
  "rouletteSecretActive",
  "betMissActive",
  // Like magicMode/betMiss, fieldReportActive has to survive the guesser's
  // own clearRoundState("guesser") call (fired the instant they submit the
  // very guess it's meant to evaluate) — postScore doesn't run until the
  // setter's subsequent Keep/New decision. Without this exemption the flag
  // gets wiped before postScore ever sees it, so the power silently never
  // grants anything.
  "fieldReportActive"
]);

function clearActivePowers(state) {
  if (!state?.powers || !Array.isArray(state.activePowers)) return;

  for (const power of state.activePowers) {
    const key = `${power}Active`;
    if (!(key in state.powers)) continue;
    if (ROUND_SCOPED_ACTIVE_POWERS.has(key)) continue;

    const val = state.powers[key];
    if (!val) continue;

    state.powers[key] = typeof val === "boolean" ? false : null;
  }
}

function clearRoundState(state, actingRole) {
  clearActivePowers(state);

  if (actingRole === "setter") {
    if (state.powers?.stealthGuessActive) state.powers.stealthGuessActive = false;
    if (state.powers?.magicModeActive) state.powers.magicModeActive = false;
    if (state.powers?.rouletteSecretActive) state.powers.rouletteSecretActive = false;

    state.setterDraft = "";
    state.activeTimer = state.guesser;
    advanceTimer(state, state.setter);
    state.turn = state.guesser;
  }

  if (actingRole === "guesser") {
    if (state.powers?.confuseColorsActive) state.powers.confuseColorsActive = false;
    if (state.powers?.countOnlyActive) state.powers.countOnlyActive = false;
    if (state.powers?.forceGuessOptions) state.powers.forceGuessOptions = null;
    if (state.powers?.nonsenseActive) state.powers.nonsenseActive = false;
    // Letter Lockout: the ban only ever covers ONE guess (the one that
    // just got validated and submitted) — clear it here regardless of
    // whether the setter picks a new one next round, matching "the
    // guesser cannot use that letter in his NEXT guess" (singular).
    if (state.powers?.letterLockoutBanned) state.powers.letterLockoutBanned = null;

    state.activeTimer = state.setter;
    advanceTimer(state, state.guesser);
    state.turn = state.setter;
  }

  state.powers.forceGuess = null;
  state.powerUsedThisTurn = false;
}

function startForceTimer(roomId, room, state, io, context) {
  const durationMs = 30000;
  const deadline = Date.now() + durationMs;

  state.powers.forceTimerActive = true;
  state.powers.forceTimerDeadline = deadline;
  state.powers.forceTimerArmed = false;

  io.to(roomId).emit("forceTimerStarted", { deadline, durationMs });

  const interval = setInterval(() => {
    const remaining = deadline - Date.now();
    io.to(roomId).emit("forceTimerTick", { remaining });

    if (remaining <= 0) {
      clearInterval(interval);
      state.powerUsedThisTurn = false;

      // No guess submitted in time -- resubmit the guesser's most recent
      // guess this round (guaranteed to exist, see POWER_RULES.js's
      // forceTimer.allowed) rather than leaving the turn stuck.
      const lastGuess = state.history[state.history.length - 1]?.guess;

      context.applyAction(
        room,
        state,
        {
          type: "SUBMIT_GUESS",
          userId: state.guesser,
          guess: lastGuess,
          ai: true
        },
        roomId,
        context
      );

      io.to(roomId).emit("forceTimerExpired");

      // This action is dispatched directly from a server-side timer, not
      // through the socket "gameAction" handler — which is the only other
      // place that re-triggers the AI after a move. Without this, the turn
      // silently passes to the AI and nothing ever prompts it to play.
      setTimeout(() => {
        try {
          context.maybeRunAI(room, roomId, context);
        } catch (err) {
          console.error("maybeRunAI crashed after force timer expiry:", err);
        }
      }, 1000);
    }
  }, 250);

  registerForceTimer(roomId, interval);
}

function pushWinEntry(state, word) {
  // Drain power-use events queued since the last entry (mirrors
  // finalizeFeedback.js) -- without this, a power used on the same turn
  // as the winning guess/secret would flash into the live log during the
  // turn but vanish permanently once the round ends, since the archived
  // entry never carried it.
  const powerEvents = Array.isArray(state._pendingPowerEvents)
    ? [...state._pendingPowerEvents]
    : [];
  state._pendingPowerEvents = [];

  state.history.push({
    guess: word,
    fb: ["🟩", "🟩", "🟩", "🟩", "🟩"],
    fbGuesser: ["🟩", "🟩", "🟩", "🟩", "🟩"],
    extraInfo: null,
    finalSecret: word,
    powerEvents
  });
}

module.exports = {
  transitionAfterGuess,
  transitionAfterSecret,
  clearRoundState,
  startForceTimer
};
