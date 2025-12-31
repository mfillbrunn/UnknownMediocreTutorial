///server/utils/roundTimer.js


function handleRoundTimeout(state, roomId, io, room, role) {
  state.roundTimeouts[role]++;

  const lastAction = state.lastSubmitted[role];

  if (!lastAction) {
    state.timeoutLoser = role;
    endGame(state, roomId, io, room);
    return;
  }

  // Auto-submit previous action
  applyAction(
    room,
    state,
    { ...lastAction, timedOut: true },
    role,
    roomId,
    { io }
  );

  resetRoundTimer(state);
  state.activeTimer = role === "A" ? "B" : "A";

  emitStateForAllPlayers(roomId, room, io);

  if (state.roundTimeouts[role] >= 3) {
    state.timeoutLoser = role;
    endGame(state, roomId, io, room);
  }
}
