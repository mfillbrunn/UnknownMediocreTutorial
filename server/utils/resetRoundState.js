const {createInitialPowers} = require("../core/stateFactory");
const {resetRoundTimer, startGameTimerSim} = require("./chessTimer");
function resetRoundState(room, state, roomId, context) {
  state.secret = "";
  state.currentSecret = "";
  state.pendingGuess = "";
  state.gameOver = false;
  state.guessCount = 0;
  state.history = [];
  state.extraConstraints= [];
  state.turn = null;
  state.simultaneousGuessSubmitted = false;
  state.simultaneousSecretSubmitted = false;
  state.powerUsedThisTurn = false;
  state.timeUsed.A = 0;
  state.timeUsed.B = 0;
  state.powersUsedThisRoundGuesser = [];
  state.powersUsedThisRoundSetter = [];
 // clear transient power effects
   state.powers = createInitialPowers();  
  if (state.timeControl.enabled) {
    resetRoundTimer(state);
    state.activeTimer = "both";
    state.roundStartTime = Date.now();
    startGameTimerSim(room, state, roomId, context)
    state.isTimerRunning=true;
  }
}

module.exports = resetRoundState;
