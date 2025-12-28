function resetRoundState(state) {
  state.secret = "";
  state.currentSecret = "";
  state.pendingGuess = "";
  state.guessCount = 0;
  state.history = [];

  state.simultaneousGuessSubmitted = false;
  state.simultaneousSecretSubmitted = false;

  state.powerUsedThisTurn = false;

  state.powersUsedThisRoundGuesser = [];
  state.powersUsedThisRoundSetter = [];

  // clear transient power effects
  for (const k in state.powers) {
    if (typeof state.powers[k] === "boolean") {
      state.powers[k] = false;
    }
  }
}

module.exports = resetRoundState;
