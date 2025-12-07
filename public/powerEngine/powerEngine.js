
// ==========================================================
// CLIENT POWER ENGINE — single source of truth for all powers
// ==========================================================

window.PowerEngine = {
  powers: {},

  // Register a power during load from each power file
  register(powerId, module) {
    this.powers[powerId] = module;
  },

  // Render all buttons (called once during setup)
  renderButtons(roomId) {
    for (const id in this.powers) {
      this.powers[id].renderButton(roomId);
    }
  },

  // Apply UI effects (called every updateUI())
  applyUI(state, myRole, roomId) {
    for (const id in this.powers) {
      const mod = this.powers[id];

      // Enable/disable button
      const btn = document.getElementById("power_" + id);
      if (btn) {
        const allowed = mod.allowed(state, myRole);
        btn.disabled = !allowed;
        btn.classList.toggle("power-used", !allowed);
        btn.onclick = allowed ? () => mod.activate(roomId) : null;
      }

      // Apply optional UI effects declaratively
      if (mod.effects && mod.effects.applyUI) {
        mod.effects.applyUI(state, myRole);
      }
    }
  }
};
