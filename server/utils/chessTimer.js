// server/utils/chessTimer.js

const INTERVALS = {};

function startTimer(roomId, state, io, players) {
  if (INTERVALS[roomId]) return;

  const lastTick = { t: Date.now() };

  INTERVALS[roomId] = setInterval(() => {
    const now = Date.now();
    const dt = Math.floor((now - lastTick.t) / 1000);
    if (dt <= 0) return;

    lastTick.t = now;

    if (state.activeTimer === "both") {
      for (const r of ["A", "B"]) {
        state.timeRemaining[r] -= dt;
        if (state.timeRemaining[r] <= 0) {
          state.timeRemaining[r] = 0;
          state.timeExpired = r;
          return;
        }
      }
    } else if (state.activeTimer) {
      const r = state.activeTimer;
      state.timeRemaining[r] -= dt;
      if (state.timeRemaining[r] <= 0) {
        state.timeRemaining[r] = 0;
        state.timeExpired = r;
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

function addIncrement(state, role) {
  state.timeRemaining[role] += state.timeControl.incrementSeconds;
}

module.exports = {
  startTimer,
  stopTimer,
  addIncrement
};
