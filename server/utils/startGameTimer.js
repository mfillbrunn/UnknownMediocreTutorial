// core/timers/gameTimer.js

const { startTimer } = require("./utils/Timer");

function startGameTimer({
  room,
  state,
  roomId,
  context,
  onTimeout
}) {
  if (!room || room.status !== "alive") return;
  if (state.isTimerRunning) return;

  const io = context.io;

  state.isTimerRunning = true;

  startTimer(roomId, state, io, timedOutRole => {
    state.isTimerRunning = false;
    onTimeout(timedOutRole);
  });
}

module.exports = { startGameTimer };
