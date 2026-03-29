const { endGame } = require("./gameOver");
const { checkSecret, checkGuess } = require("../../game-engine/validation");
const { isPowerAllowed } = require("../../powers/POWER_RULES");
const { transitionAfterGuess, transitionAfterSecret } = require("../transitions/normalTransitions");
const { emitRoomState } = require("../rooms");

function handleNormalPhase(room, state, action, role, roomId, context) {
  const io = context.io;
  const { powerEngine } = context;
  const userId = action.userId;

  if (!userId) return;

  // Concede
  if (action.type === "CONCEDE") {
    if (userId === state.guesser) {
      state.guessCount += 10;
    }
    endGame(state, roomId, io, room, context);
    return;
  }

  // Guesser submit
  if (
    !state.pendingGuess &&
    action.type === "SUBMIT_GUESS" &&
    userId === state.guesser
  ) {
    const res = checkGuess({
      guess: action.guess,
      state,
      allowedGuesses: context.ALLOWED_GUESSES
    });

    if (!res.ok) {
      io.to(room.playersByUserId?.[userId]?.socketId).emit("errorMessage", res.error);
      return;
    }

    const guess = action.guess.toUpperCase();
    state.guessCount += 1;

    if (state.roundStartTime && state.timeUsed?.[state.guesser] != null) {
      state.timeUsed[state.guesser] += Math.floor((Date.now() - state.roundStartTime) / 1000);
    }
    state.roundStartTime = Date.now();

    transitionAfterGuess({
      room,
      state,
      guess,
      roomId,
      context,
      io
    });
    return;
  }

  // Setter submit
  if (
    state.pendingGuess &&
    state.turn === state.setter &&
    userId === state.setter &&
    (action.type === "SET_SECRET_NEW" || action.type === "SET_SECRET_SAME")
  ) {
    const secret =
      action.type === "SET_SECRET_NEW"
        ? action.secret.toUpperCase()
        : state.secret;

    const res = checkSecret({
      secret,
      state,
      allowedSecrets: context.ALLOWED_SECRETS
    });

    if (!res.ok) {
      io.to(room.playersByUserId?.[userId]?.socketId).emit("errorMessage", res.error);
      return;
    }

    if (powerEngine.beforeSetterSecretChange(state, action)) return;

    if (
      state.powers.assassinWord &&
      secret.toUpperCase() === state.powers.assassinWord.toUpperCase()
    ) {
      io.to(room.playersByUserId?.[userId]?.socketId).emit(
        "errorMessage",
        "Secret cannot match assassin word!"
      );
      return;
    }

    if (state.roundStartTime && state.timeUsed?.[state.setter] != null) {
      state.timeUsed[state.setter] += Math.floor((Date.now() - state.roundStartTime) / 1000);
    }
    state.roundStartTime = Date.now();

    transitionAfterSecret({
      room,
      state,
      secret,
      roomId,
      context,
      io
    });
    return;
  }

  // Powers
  if (action.type.startsWith("USE_")) {
    const powerId = normalizePowerId(action.type);

    if (!state.powerUsedThisTurn && isPowerAllowed(powerId, state)) {
      const applied = powerEngine.applyPower(powerId, state, action, roomId, io, room);
      if (applied !== false) {
        state.powerUsedThisTurn = true;
      }
    }

    emitRoomState(roomId, room, io);
    return;
  }
}

function normalizePowerId(type) {
  const raw = type.replace("USE_", "").toLowerCase();
  return raw.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

module.exports = {
  handleNormalPhase
};
