// server/powers/logPowerUse.js
// Generic capture of what a power's apply()/postScore() already broadcasts,
// so the action log and popups can reuse it without every power module
// needing to know about logging. Only room-wide emits (io.to(roomId).emit /
// io.emit) are captured — private single-player emits (io.to(playerId)...)
// stay untouched, which preserves each power's existing secrecy rules
// (e.g. the assassin word itself is never sent room-wide, only to the setter).

// A handful of powers predate the server-side POWER_METADATA role field.
const FALLBACK_ROLE = {
  betMiss: "guesser",
  revealPenalty: "setter",
  nonsense: "guesser"
};

function wrapIoForCapture(io, roomId, capture) {
  return {
    to(target) {
      const real = io.to(target);
      return {
        emit(event, payload) {
          if (event !== "errorMessage") {
            capture.push({ event, payload, public: target === roomId });
          }
          return real.emit(event, payload);
        }
      };
    },
    emit(event, payload) {
      if (event !== "errorMessage") capture.push({ event, payload, public: true });
      return io.emit(event, payload);
    }
  };
}

function pushPendingEvent(state, id, actorRole, roomId, io, capture) {
  const publicEmissions = capture.filter(e => e.public);
  if (!publicEmissions.length) return;

  if (!Array.isArray(state._pendingPowerEvents)) state._pendingPowerEvents = [];
  const payload = {
    id,
    actorRole: actorRole || null,
    emissions: publicEmissions.map(e => ({ event: e.event, payload: e.payload }))
  };
  state._pendingPowerEvents.push(payload);
  io.to(roomId).emit("powerActivity", payload);
}

module.exports = { wrapIoForCapture, pushPendingEvent, FALLBACK_ROLE };
