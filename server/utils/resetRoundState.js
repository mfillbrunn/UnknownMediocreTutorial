const {createInitialPowers} = require("../core/stateFactory");
const {resetRoundTimer} = require("./Timer");
function resetRoundState(room, state, roomId, context) {
  state.secret = "";
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
  }
}

module.exports = resetRoundState;
