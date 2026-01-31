const engine = require("../powerEngineServer");

engine.registerPower("nonsense", {
  apply(state, action, roomId, io) {
    if (state.powers.nonsenseUsed) return false ;
    state.powers.nonsenseUsed = true;
    state.powers.nonsenseActive = true;
    io.to(roomId).emit(
      "toast",
      "Nonsense power activated - this round, the guess does not have to make sense."
    );
    io.to(roomId).emit("powerUsed", { type: "nonsense" });
  },

  turnStart(state, role) {
    if (role === state.setter && state.powers.nonsenseUsed && state.powers.nonsenseActive) {
      state.powers.nonsenseActive = false;
      state.powers.nonsenseLastTurn = true;
    } else if (role === state.setter && state.powers.nonsenseUsed && state.powers.nonsenseLastTurn){
      state.powers.nonsenseLastTurn = false;
    }
    
  }
});
