const { emitStateForAllPlayers } = require("../../utils/emitState");
const { endGame } = require("./gameOver");
const { checkSecret, checkGuess } = require("../../game-engine/validation");
const { isPowerAllowed } = require("../../powers/POWER_RULES");
const {transitionAfterGuess, transitionAfterSecret} = require("../transitions/normalTransitions");

function handleNormalPhase(room, state, action, role, roomId, context) {
  const io = context.io;
  //Concede
  const { ALLOWED_GUESSES, powerEngine } = context;
  if (action.type === "CONCEDE") {
  if (role === state.guesser) state.guessCount += 10;
  endGame(state, roomId, io, room, context);
  return;
}
  /// GUESSER SUBMIT
  if (!state.pendingGuess && action.type === "SUBMIT_GUESS" && role === state.guesser) {
    const res = checkGuess({guess: action.guess,state,allowedGuesses: context.ALLOWED_GUESSES});
    if (!res.ok) {
      const socketId = room.playersByUserId?.[action.userId]?.socketId;
      if (socketId) {
        io.to(socketId).emit("errorMessage", res.error);
      }
      return;
    }
    const g = action.guess.toUpperCase(); 
    state.guessCount= state.guessCount + 1;
    state.timeUsed[state.guesser] +=  Math.floor((Date.now() - state.roundStartTime) / 1000);
    state.roundStartTime = Date.now();

    transitionAfterGuess({
      room,
      state,
      guess: g,
      roomId,
      context,
      io
    });
    return;
  }
  /// SETTER
if (state.pendingGuess && state.turn === state.setter && (action.type === "SET_SECRET_NEW" || action.type === "SET_SECRET_SAME") ) {
    const w = action.type === "SET_SECRET_NEW" ? action.secret.toUpperCase(): state.secret;
    const res = checkSecret({secret: w, state, allowedSecrets: context.ALLOWED_SECRETS });
    if (!res.ok) {
      const socketId = room.playersByUserId?.[action.userId]?.socketId;
      if (socketId) {
        io.to(socketId).emit("errorMessage", res.error);
      }
      return;
    }
    if (powerEngine.beforeSetterSecretChange(state, action)) return;
    if (state.powers.assassinWord && w.toUpperCase() === state.powers.assassinWord.toUpperCase()) {
      const socketId = room.playersByUserId?.[action.userId]?.socketId;
      if (socketId) {
        io.to(socketId).emit("errorMessage", "Secret cannot match assassin word!");
      }
      return;
    }
      state.timeUsed[state.setter] +=  Math.floor((Date.now() - state.roundStartTime) / 1000);
      state.roundStartTime = Date.now();    
      transitionAfterSecret({
          room,
          state,
          secret: w,
          roomId,
          context,
          io
        });
      return;
    }
  
  /// POWERs
  if (action.type.startsWith("USE_")) {
    const powerId = normalizePowerId(action.type);
    if (!state.powerUsedThisTurn && isPowerAllowed(powerId, state)) {
      action.room = room;
      const applied = powerEngine.applyPower(powerId, state, action, roomId, io);
      if (applied!==false) {state.powerUsedThisTurn = true;}
    }
    emitStateForAllPlayers(roomId, room, io);
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
