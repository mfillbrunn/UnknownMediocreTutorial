///utils/Timer.js

const INTERVALS = {};

function startTimer(roomId, state, io, onTimeout) {
  if (INTERVALS[roomId]) return;

  const myGeneration = state._timerGeneration; // 🔑 capture generation
  let lastTick = Date.now();

  INTERVALS[roomId] = setInterval(() => {
    // 🔥 If state was replaced / match restarted, kill timer
    if (state._timerGeneration !== myGeneration) {
      stopTimer(roomId);
      return;
    }

    if (state.paused) return;

    const now = Date.now();
    const dt = Math.floor((now - lastTick) / 1000);
    if (dt <= 0) return;
    lastTick = now;

    const roles =
      state.activeTimer === "both"
        ? ["A", "B"]
        : [state.activeTimer];

    for (const role of roles) {
      state.timeRemaining[role] -= dt;

      if (state.timeRemaining[role] <= 0) {
        state.timeRemaining[role] = 0;
        stopTimer(roomId);
        onTimeout(role);
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

function resetRoundTimer(state) {
  const secs =
    state.timeControl.mode === "round"
      ? state.timeControl.roundSeconds
      : state.timeControl.initialSeconds;

  state.timeRemaining.A = secs;
  state.timeRemaining.B = secs;
}


module.exports = {
  startTimer,
  stopTimer,
  addIncrement,
  resetRoundTimer
};
