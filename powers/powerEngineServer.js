// /powers/powerEngineServer.js
//
// Central registry for server-side powers.
// Each power module registers itself via engine.registerPower().

const engine = {
  powers: {},

  registerPower(id, handlers) {
    this.powers[id] = handlers;
  },

  applyPower(id, state, action, roomId, io) {
    const p = this.powers[id];
    if (!p || typeof p.apply !== "function") return;
    p.apply(state, action, roomId, io);
  },

  // Called BEFORE scoring a guess (setter or guesser)
  preScore(state, guess) {
    for (const id in this.powers) {
      if (typeof this.powers[id].preScore === "function") {
        this.powers[id].preScore(state, guess);
      }
    }
  },

  // Called AFTER scoring + feedback creation
  postScore(state, historyEntry) {
    for (const id in this.powers) {
      if (typeof this.powers[id].postScore === "function") {
        this.powers[id].postScore(state, historyEntry);
      }
    }
  },

  // Called when a new turn begins
  turnStart(state, role) {
    for (const id in this.powers) {
      if (typeof this.powers[id].turnStart === "function") {
        this.powers[id].turnStart(state, role);
      }
    }
  }
};

module.exports = engine;
