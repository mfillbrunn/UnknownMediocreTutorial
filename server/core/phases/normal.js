const { endGame } = require("./gameOver");
const { checkSecret, checkGuess } = require("../../game-engine/validation");
const { isPowerAllowed } = require("../../powers/POWER_RULES");
const POWER_METADATA = require("../../powers/powerMetadata");
const { transitionAfterGuess, transitionAfterSecret } = require("../transitions/normalTransitions");
const { emitRoomState } = require("../rooms");
const { scoreGuess } = require("../../game-engine/scoring");
const { isConsistentWithHistory } = require("../../game-engine/history");
const { addIncrement, resetRoundTimer } = require("../../utils/Timer");

function handleNormalPhase(room, state, action, roomId, context) {
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

  // Double Tap: two guesses at once, both scored against the CURRENT secret
  // (before the setter can change), feedback combined for the guesser. The
  // setter sees only one (random); the other is masked in their history.
  // After scoring, the setter gets a fresh keep/change decision for the next
  // guesser turn (awaitingFreshSecret) — so the two taps land on one secret,
  // then normal play resumes.
  if (
    action.type === "USE_DOUBLE_GUESS" &&
    userId === state.guesser &&
    !state.pendingGuess
  ) {
    const socketId = room.playersByUserId?.[userId]?.socketId ?? null;
    if (
      !state.activePowers?.includes("doubleGuess") ||
      state.powers.doubleGuessUsed ||
      state.powerUsedThisTurn ||
      state.turn !== state.guesser
    ) {
      return;
    }

    const g1 = (action.guess1 || "").toUpperCase();
    const g2 = (action.guess2 || "").toUpperCase();
    for (const g of [g1, g2]) {
      const chk = checkGuess({ guess: g, state, allowedGuesses: context.ALLOWED_GUESSES });
      if (!chk.ok) {
        if (socketId) io.to(socketId).emit("errorMessage", chk.error);
        return;
      }
    }

    state.powers.doubleGuessUsed = true;
    state.powerUsedThisTurn = true;

    const secret = state.secret.toUpperCase();
    // Random which one the setter gets to see.
    const shownIsFirst = Math.random() < 0.5;
    const shown = shownIsFirst ? g1 : g2;
    const hidden = shownIsFirst ? g2 : g1;

    const fbShown = scoreGuess(secret, shown);
    const fbHidden = scoreGuess(secret, hidden);

    const mkEntry = (guess, fb, isHidden) => ({
      guess,
      fb,
      fbGuesser: [...fb],
      extraInfo: null,
      finalSecret: secret,
      roundIndex: state.history.length,
      powerEvents: [],
      doubleGuessApplied: true,
      doubleGuessHidden: isHidden
    });

    // Keep the on-board order stable (g1 then g2), independent of which was
    // shown, so neither player can infer shown/hidden from row order.
    const e1 = mkEntry(g1, shownIsFirst ? fbShown : fbHidden, !shownIsFirst);
    const e2 = mkEntry(g2, shownIsFirst ? fbHidden : fbShown, shownIsFirst);
    state.history.push(e1, e2);
    state.guessCount += 2;

    if (state.roundStartTime && state.timeUsed?.[state.guesser] != null) {
      state.timeUsed[state.guesser] += Math.floor((Date.now() - state.roundStartTime) / 1000);
    }
    state.roundStartTime = Date.now();

    io.to(roomId).emit("powerUsed", { type: "doubleGuess" });
    if (socketId) {
      io.to(socketId).emit("doubleGuessResult", {
        guesses: [
          { guess: g1, fb: [...(shownIsFirst ? fbShown : fbHidden)] },
          { guess: g2, fb: [...(shownIsFirst ? fbHidden : fbShown)] }
        ]
      });
    }

    // Win if EITHER guess is the secret.
    if (g1 === secret || g2 === secret) {
      io.to(roomId).emit("secretFound");
      endGame(state, roomId, io, room, context);
      return;
    }

    // Otherwise: setter reacts (fresh keep/change) for the next guesser turn.
    state.pendingGuess = "";
    state.awaitingFreshSecret = true;
    state.turn = state.setter;
    state.powerUsedThisTurn = false;
    state.activeTimer = state.setter;
    if (state.timeControl?.mode === "round") resetRoundTimer(state);

    context.powerEngine.turnStart(state, state.turn, roomId, io);
    emitRoomState(roomId, room, io);
    return;
  }

  // Fresh-secret decision after a Double Tap: the setter sets their next
  // secret with no pending guess to score. Validated for consistency with
  // all history (including the two taps), then play returns to the guesser.
  if (
    state.awaitingFreshSecret &&
    !state.pendingGuess &&
    state.turn === state.setter &&
    userId === state.setter &&
    (action.type === "SET_SECRET_NEW" || action.type === "SET_SECRET_SAME")
  ) {
    const socketId = room.playersByUserId?.[userId]?.socketId ?? null;
    const secret =
      action.type === "SET_SECRET_NEW"
        ? (action.secret || "").toUpperCase()
        : state.secret;

    const res = checkSecret({ secret, state, allowedSecrets: context.ALLOWED_SECRETS });
    if (!res.ok) {
      if (socketId) io.to(socketId).emit("errorMessage", res.error);
      return;
    }
    if (
      state.powers.assassinWord &&
      secret === state.powers.assassinWord.toUpperCase()
    ) {
      if (socketId) io.to(socketId).emit("errorMessage", "Secret cannot match assassin word!");
      return;
    }

    if (state.roundStartTime && state.timeUsed?.[state.setter] != null) {
      state.timeUsed[state.setter] += Math.floor((Date.now() - state.roundStartTime) / 1000);
    }
    state.roundStartTime = Date.now();

    state.secret = secret;
    state.awaitingFreshSecret = false;
    state.setterDraft = "";
    state.turn = state.guesser;
    state.activeTimer = state.guesser;
    state.powerUsedThisTurn = false;
    if (state.timeControl?.mode === "chess") addIncrement(state, state.setter);
    else if (state.timeControl?.mode === "round") resetRoundTimer(state);

    context.powerEngine.turnStart(state, state.turn, roomId, io);
    emitRoomState(roomId, room, io);
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
    if (state.simultaneousAllWrong && action.type === "SET_SECRET_NEW") {
      io.to(action.playerId).emit("errorMessage", "All feedback was wrong — you must keep the same secret this round.");
      return;
    } 
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

    // isPowerAllowed() only checks whose TURN it is, not who is actually
    // calling — without this, any connected player (or a mistimed AI
    // action) could trigger the other role's power as long as the game
    // happened to be in that role's turn.
    const requiredRole = POWER_METADATA[powerId]?.role;
    const callerRole = room.state.players?.[userId]?.role;
    const callerOwnsThisPower = !requiredRole || callerRole === requiredRole;

    if (
      callerOwnsThisPower &&
      !state.powerUsedThisTurn &&
      isPowerAllowed(powerId, state)
    ) {
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
