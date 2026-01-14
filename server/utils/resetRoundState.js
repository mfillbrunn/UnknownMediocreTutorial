function resetRoundState(state) {
  state.secret = "";
  state.currentSecret = "";
  state.pendingGuess = "";
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
}

module.exports = resetRoundState;
