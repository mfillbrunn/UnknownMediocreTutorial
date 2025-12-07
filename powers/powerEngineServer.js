// SERVER POWER ENGINE — routes USE_POWER actions to the correct module

const powers = {};

module.exports = {
  registerPower(id, module) {
    powers[id] = module;
  },

  applyPower(id, state, action, roomId, io) {
    const p = powers[id];
    if (!p) return;
    return p.apply(state, action, roomId, io);
  }
};
