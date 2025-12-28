// server/utils/chessTimer.js

const INTERVALS = {};

function startTimer(roomId, state, io, onTimeout) {
  if (INTERVALS[roomId]) return;

  let lastTick = Date.now();

  INTERVALS[roomId] = setInterval(() => {
    const now = Date.now();
    const dt = Math.floor((now - lastTick) / 1000);
    if (dt <= 0) return;

    lastTick = now;

    const tickRole = state.activeTimer;

    const applyTick = role => {
      state.timeRemaining[role] -= dt;
      if (state.timeRemaining[role] <= 0) {
        state.timeRemaining[role] = 0;
        stopTimer(roomId);
        onTimeout(role);
        return true;
      }
      return false;
    };

    if (tickRole === "both") {
      if (applyTick("A")) return;
      if (applyTick("B")) return;
    } else if (tickRole) {
      applyTick(tickRole);
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
  state.timeRemaining.A = state.timeControl.initialSeconds;
  state.timeRemaining.B = state.timeControl.initialSeconds;
  state.timeExpired = null;
  state.timeoutLoser = null;
}

module.exports = {
  startTimer,
  stopTimer,
  addIncrement,
  resetRoundTimer
};
