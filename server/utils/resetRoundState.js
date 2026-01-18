const {createInitialPowers} = require("../core/stateFactory");
const {resetRoundTimer} = require("./chessTimer");
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
  if (state.activePowers.includes("revealLetter")) {
      const saved_mode = state.powers.revealLetter.mode;
  }    
 // clear transient power effects
   state.powers = createInitialPowers(); 
    if (state.activePowers.includes("revealLetter")) {
      state.powers.revealLetter.mode = saved_mode;
    }
    if (state.timeControl.enabled) {
    resetRoundTimer(state);
    state.activeTimer = "both";
    state.roundStartTime = Date.now()
    state.isTimerRunning=true;
  }
}

module.exports = resetRoundState;
