function resetRoundState(state) {
  state.secret = "";
  state.currentSecret = "";
  state.pendingGuess = "";
  state.guessCount = 0;
  state.history = [];

  state.simultaneousGuessSubmitted = false;
  state.simultaneousSecretSubmitted = false;

  state.powerUsedThisTurn = false;
  state.timeUsed.A = 0,
    state.timeUsed.B = 0,
  state.powersUsedThisRoundGuesser = [];
  state.powersUsedThisRoundSetter = [];

    state.powers.blindSpotUsed = false;
    state.powers.blindSpotIndex = null;

  // clear transient power effects
  for (const k in state.powers) {
    if (typeof state.powers[k] === "boolean") {
      state.powers[k] = false;
    }
  }
}

module.exports = resetRoundState;
