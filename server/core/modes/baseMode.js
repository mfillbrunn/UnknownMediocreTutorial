class BaseMode {
  initMatch(state) {}

  onLobbyReady(state) {}

  onRoundEnd(state) {
    return { nextPhase: "gameOver" };
  }

  onNextRound(state) {
    return null;
  }

  isMatchOver(state) {
    return true;
  }
}

module.exports = BaseMode;
