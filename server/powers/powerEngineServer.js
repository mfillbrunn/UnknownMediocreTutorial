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
        try {
          if (p.beforeSetterSecretChange(state, action)) {
            return true;
          }
        } catch (err) {
          console.error(`[powerEngine] beforeSetterSecretChange crashed for "${id}":`, err);
        }
      }
    }
    return false;
  },

  preScore(state, guess, roomId, io) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (typeof p.preScore === "function") {
        try {
          p.preScore(state, guess, roomId, io);
        } catch (err) {
          console.error(`[powerEngine] preScore crashed for "${id}":`, err);
        }
      }
    }
  },

  postScore(state, entry, roomId, io) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (typeof p.postScore === "function") {
        const capture = [];
        const wrappedIo = wrapIoForCapture(io, roomId, capture);
        try {
          p.postScore(state, entry, roomId, wrappedIo);
          const actorRole = FALLBACK_ROLE[id] || POWER_METADATA[id]?.role || null;
          pushPendingEvent(state, id, actorRole, roomId, io, capture);
        } catch (err) {
          console.error(`[powerEngine] postScore crashed for "${id}":`, err);
        }
      }
    }
  },

  // Each power's turnStart runs independently, guarded by its own
  // try/catch: this loop drives every subsequent action in the game (a
  // human's submit, or an AI's — see runAI.js's applyAIAction, which has
  // no catch of its own around this call chain), so one power throwing
  // here used to abort every OTHER power's turnStart in the same pass and
  // skip the emitRoomState at the end of the caller's action handler.
  // From either player's screen that reads as the game simply freezing —
  // no error toast, no state update, nothing to retry. Contain it exactly
  // like postScore/onGuessSubmitted already do below.
  turnStart(state, role, roomId, io) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (typeof p.turnStart === "function") {
        try {
          p.turnStart(state, role, roomId, io);
        } catch (err) {
          console.error(`[powerEngine] turnStart crashed for "${id}":`, err);
        }
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
        try {
          p.onGuessSubmitted(state, guess, roomId, wrappedIo);
          const actorRole = FALLBACK_ROLE[id] || POWER_METADATA[id]?.role || null;
          pushPendingEvent(state, id, actorRole, roomId, io, capture);
        } catch (err) {
          console.error(`[powerEngine] onGuessSubmitted crashed for "${id}":`, err);
        }
      }
    }
  }
};

module.exports = engine;
