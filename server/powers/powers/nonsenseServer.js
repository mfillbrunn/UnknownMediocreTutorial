const engine = require("../powerEngineServer");

engine.registerPower("nonsense", {
  apply(state, action, roomId, io) {
    if (state.powers.nonsenseUsed) return;
    state.powers.nonsenseUsed = true;
    state.powers.nonsenseActive = true;
    io.to(roomId).emit(
      "toast",
      "Nonsense power activated - this round, the guess does not have to make sense."
    );
  },

  turnStart(state, role) {
    if (role === state.guesser && state.powers.nonsenseUsed && state.powers.nonsenseActive) {
      state.powers.nonsenseActive = false;
      state.powers.nonsenseLastTurn = true;
    } else if (role === state.guesser && state.powers.nonsenseUsed && state.powers.nonsenseLastTurn){
      state.powers.nonsenseLastTurn = false;
    }
    
  }
});
