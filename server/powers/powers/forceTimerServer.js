engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    if (state.powers.forceTimerUsed) return;
    if (state.powerUsedThisTurn) return;

    state.powers.forceTimerUsed = true;
    state.powers.forceTimerArmed = true;
    state.powerUsedThisTurn = true;

    io.to(roomId).emit(
      "toast",
      "⏱ Force Timer armed — setter will be timed next turn."
    );
  }
});
