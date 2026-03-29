// utils/Timer.js

const INTERVALS = {};

function getActiveTimerUserIds(state) {
  if (state.activeTimer === "both") {
    return [state.setter, state.guesser].filter(Boolean);
  }

  if (!state.activeTimer) {
    return [];
  }

  return [state.activeTimer];
}

function startTimer(roomId, state, io, onTimeout) {
  if (INTERVALS[roomId]) return;

  const myGeneration = state._timerGeneration;
  let lastTick = Date.now();

  INTERVALS[roomId] = setInterval(() => {
    if (state._timerGeneration !== myGeneration) {
      stopTimer(roomId);
      return;
    }

    if (state.paused) return;

    const now = Date.now();
    const dt = Math.floor((now - lastTick) / 1000);
    if (dt <= 0) return;

    lastTick = now;

    const activeUserIds = getActiveTimerUserIds(state);

    for (const userId of activeUserIds) {
      state.timeRemaining[userId] = Math.max(
        0,
        (state.timeRemaining[userId] || 0) - dt
      );

      if (state.timeRemaining[userId] <= 0) {
        state.timeRemaining[userId] = 0;
        stopTimer(roomId);
        onTimeout(userId);
        return;
      }
    }

    io.to(roomId).emit("timerTick", {
      timeRemaining: state.timeRemaining
    });
  }, 250);
}

function stopTimer(roomId) {
  if (INTERVALS[roomId]) {
    clearInterval(INTERVALS[roomId]);
    delete INTERVALS[roomId];
  }
}

function addIncrement(state, userId) {
  if (!userId) return;
  state.timeRemaining[userId] =
    (state.timeRemaining[userId] || 0) + state.timeControl.incrementSeconds;
}

function resetRoundTimer(state) {
  const secs =
    state.timeControl.mode === "round"
      ? state.timeControl.roundSeconds
      : state.timeControl.initialSeconds;

  for (const userId of Object.keys(state.players || {})) {
    state.timeRemaining[userId] = secs;
  }
}

module.exports = {
  startTimer,
  stopTimer,
  addIncrement,
  resetRoundTimer,
  getActiveTimerUserIds
};
