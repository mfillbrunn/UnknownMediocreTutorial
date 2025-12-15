// /powers/powerEngineServer.js

const engine = {
  powers: {},

  registerPower(id, handlers) {
    this.powers[id] = handlers;
  },

  applyPower(id, state, action, roomId, room, io) {
    const p = this.powers[id];
    if (!p || typeof p.apply !== "function") return;
    p.apply(state, action, roomId, room, io);
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

  preScore(state, guess, roomId, room, io) {
  for (const id in this.powers) {
    const p = this.powers[id];
    if (typeof p.preScore === "function") {
      p.preScore(state, guess, roomId, room, io);
    }
  }
},

postScore(state, entry, roomId, room, io) {
  for (const id in this.powers) {
    const p = this.powers[id];
    if (typeof p.postScore === "function") {
      p.postScore(state, entry, roomId, room, io);
    }
  }
},


  turnStart(state, role, roomId, room, io) {
  for (const id in this.powers) {
    const p = this.powers[id];
    if (typeof p.turnStart === "function") {
      p.turnStart(state, role, roomId, room, io);
    }
  }
}

};

module.exports = engine;
