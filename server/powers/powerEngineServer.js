// /powers/powerEngineServer.js
const POWER_METADATA = require("./powerMetadata");
const { wrapIoForCapture, pushPendingEvent, FALLBACK_ROLE } = require("./logPowerUse");
const engine = {
  powers: {},

  registerPower(id, handlers) {
    this.powers[id] = handlers;
  },

  applyPower(id, state, action, roomId, io, room) {
    const p = this.powers[id];
    if (!p || typeof p.apply !== "function") return;

    const capture = [];
    const wrappedIo = wrapIoForCapture(io, roomId, capture);
    const result = p.apply(state, action, roomId, wrappedIo, room);
    if (result === false) return false;

    const actorUserId = action?.userId;
    const actorRole =
      actorUserId === state.guesser ? "guesser" :
      actorUserId === state.setter ? "setter" :
      FALLBACK_ROLE[id] || POWER_METADATA[id]?.role || null;

    pushPendingEvent(state, id, actorRole, roomId, io, capture);
  },

  beforeSetterSecretChange(state, action) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (typeof p.beforeSetterSecretChange === "function") {
        if (p.beforeSetterSecretChange(state, action)) {
          return true;
        }
      }
    }
    return false;
  },

  preScore(state, guess, roomId, io) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (typeof p.preScore === "function") {
        p.preScore(state, guess, roomId, io);
      }
    }
  },

  postScore(state, entry, roomId, io) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (typeof p.postScore === "function") {
        const capture = [];
        const wrappedIo = wrapIoForCapture(io, roomId, capture);
        p.postScore(state, entry, roomId, wrappedIo);
        const actorRole = FALLBACK_ROLE[id] || POWER_METADATA[id]?.role || null;
        pushPendingEvent(state, id, actorRole, roomId, io, capture);
      }
    }
  },

  turnStart(state, role, roomId, io) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (typeof p.turnStart === "function") {
        p.turnStart(state, role, roomId, io);
      }
    }
  },

  // Fires the instant a guess is submitted (normal phase), before the
  // setter's Keep/New decision and before finalizeFeedback/postScore. For
  // powers whose evaluation only depends on the guess word itself (not the
  // secret or feedback), this is the earliest correct moment to act — no
  // reason to wait for scoring just to tell the player something already
  // knowable from their own guess.
  onGuessSubmitted(state, guess, roomId, io) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (typeof p.onGuessSubmitted === "function") {
        const capture = [];
        const wrappedIo = wrapIoForCapture(io, roomId, capture);
        p.onGuessSubmitted(state, guess, roomId, wrappedIo);
        const actorRole = FALLBACK_ROLE[id] || POWER_METADATA[id]?.role || null;
        pushPendingEvent(state, id, actorRole, roomId, io, capture);
      }
    }
  }
};

module.exports = engine;
