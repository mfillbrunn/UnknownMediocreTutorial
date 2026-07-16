// utils/draftTimer.js
//
// Standalone 30s countdown for the pre-round power draft. Deliberately not
// built on Timer.js — that module is tightly coupled to per-player
// timeRemaining budgets (round/game time control), which the draft has
// nothing to do with.

const INTERVALS = {};

function startDraftTimer(roomId, state, io, onExpire) {
  stopDraftTimer(roomId);

  INTERVALS[roomId] = setInterval(() => {
    if (state.phase !== "draft") {
      stopDraftTimer(roomId);
      return;
    }

    const remainingMs = (state.draftDeadline || 0) - Date.now();

    if (remainingMs <= 0) {
      stopDraftTimer(roomId);
      onExpire();
      return;
    }

    io.to(roomId).emit("draftTick", { remainingMs });
  }, 500);
}

function stopDraftTimer(roomId) {
  if (INTERVALS[roomId]) {
    clearInterval(INTERVALS[roomId]);
    delete INTERVALS[roomId];
  }
}

module.exports = { startDraftTimer, stopDraftTimer };
