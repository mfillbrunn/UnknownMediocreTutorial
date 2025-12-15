// /powers/powerEngineServer.js

const engine = {
  powers: {},

  registerPower(id, handlers) {
    this.powers[id] = handlers;
  },

  applyPower(id, state, action, roomId, io) {
    const p = this.powers[id];
    console.log("[DEBUG] applyPower called with id =", id, "→ handler exists?", !!p);
    if (!p || typeof p.apply !== "function") return;
    console.log("[DEBUG] Running apply() for power:", id);
    p.apply(state, action, roomId, io, room);
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


  turnStart(state, role) {
    for (const id in this.powers) {
      if (typeof this.powers[id].turnStart === "function") {
        this.powers[id].turnStart(state, role);
      }
    }
  }
};

module.exports = engine;
