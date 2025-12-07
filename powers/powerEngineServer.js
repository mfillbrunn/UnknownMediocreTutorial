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

  // NEW HOOK: allow powers to block setter secret changes
  beforeSetterSecretChange(state, action) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (typeof p.beforeSetterSecretChange === "function") {
        const blocked = p.beforeSetterSecretChange(state, action);
        if (blocked) return true;
      }
    }
    return false;
  },

  preScore(state, guess) {
    for (const id in this.powers) {
      if (typeof this.powers[id].preScore === "function") {
        this.powers[id].preScore(state, guess);
      }
    }
  },

  postScore(state, entry) {
    for (const id in this.powers) {
      if (typeof this.powers[id].postScore === "function") {
        this.powers[id].postScore(state, entry);
      }
    }
  },

  turnStart(state, role) {
    for (const id in this.powers) {
      if (typeof this.powers[id].turnStart === "function") {
        this.powers[id].turnStart(state, role);
      }
    }
  }
};

module.exports = engine;
