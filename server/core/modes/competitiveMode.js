const BaseMode = require("./baseMode");

class CompetitiveMode extends BaseMode {
  initMatch(state) {
    state.roundIndex = 0;
    state.roundsTotal = 2;
    state.matchOver = false;

    state.initialSetter = state.setter;
    state.initialGuesser = state.guesser;
  }

  onLobbyReady(state, setterPowers, guesserPowers) {
    state.initialPowers = {
      setter: setterPowers,
      guesser: guesserPowers
    };

    // Round 1 powers
    state.activePowers = [...setterPowers, ...guesserPowers];
  }

  /**
   * Called when a round ends.
   * Decides WHAT kind of gameOver we are in.
   */
  onRoundEnd(state) {
    // More rounds to play → round summary
    if (state.roundIndex < state.roundsTotal - 1) {
      return {
        view: "round",
        canNextRound: true
      };
    }

    // Final round → match summary
    state.matchOver = true;
    return {
      view: "match",
      canNextRound: false
    };
  }

  /**
   * Called when NEXT_ROUND is clicked during gameOver (round view).
   * Performs role swap and prepares next round.
   */
  onNextRound(state) {
    state.roundIndex += 1;

    // swap roles
    [state.setter, state.guesser] = [state.guesser, state.setter];

    // swap powers (same powers, reversed roles)
    state.activePowers = [
      ...state.initialPowers.guesser,
      ...state.initialPowers.setter
    ];

    return {
      phase: "simultaneous",
      resetRound: true
    };
  }

  isMatchOver(state) {
    return state.matchOver;
  }
}

module.exports = CompetitiveMode;
