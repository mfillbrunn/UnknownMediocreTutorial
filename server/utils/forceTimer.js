const FORCE_TIMER_INTERVALS = {};

function clearForceTimer(roomId, state) {
  if (FORCE_TIMER_INTERVALS[roomId]) {
    clearInterval(FORCE_TIMER_INTERVALS[roomId]);
    delete FORCE_TIMER_INTERVALS[roomId];
  }
  if (state?.powers) {
    delete state.powers.forceTimerActive;
    delete state.powers.forceTimerDeadline;
    delete state.powers.forceTimerArmed;
  }
}

function registerForceTimer(roomId, intervalId) {
  FORCE_TIMER_INTERVALS[roomId] = intervalId;
}

module.exports = {
  clearForceTimer,
  registerForceTimer
};
