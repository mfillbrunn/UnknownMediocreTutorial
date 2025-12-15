// /powers/powerEngineServer.js

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
        p.postScore(state, entry, roomId, io);
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
  }
};

module.exports = engine;
