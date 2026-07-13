const { createInitialPowers } = require("../core/stateFactory");
const { resetRoundTimer } = require("./Timer");

function resetRoundState(room, state, roomId, context) {
  state.secret = "";
  state.pendingGuess = "";
  state.gameOver = false;
  state.guessCount = 0;
  state.history = [];
  state.extraConstraints = [];
  state.turn = null;
  state.simultaneousGuessSubmitted = false;
  state.simultaneousSecretSubmitted = false;
  state.powerUsedThisTurn = false;
  state.roundStartTime = null;
  state.timeoutLoser = null;

  state._pendingPowerEvents = [];

  state.timeUsed ||= {};
  state.roundTimeouts ||= {};
  state.timeRemaining ||= {};

  for (const userId of Object.keys(state.players || {})) {
    state.timeUsed[userId] = 0;
    state.roundTimeouts[userId] = 0;
  }

  // clear transient power effects
  state.powers = createInitialPowers();

  if (state.timeControl?.enabled) {
    resetRoundTimer(state);
    state.activeTimer = "both";
  } else {
    state.activeTimer = null;
  }
}

module.exports = resetRoundState;
