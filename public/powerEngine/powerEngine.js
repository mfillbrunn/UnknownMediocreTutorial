// /public/powerEngine/powerEngine.js
//
// Central client-side power engine.
// Each power module registers:
//   uiEffects(state, role)
//   keyboardEffects(state, role, keyElement, letter)
//   historyEffects(entry, isSetter)
//
// client.js calls:
//   PowerEngine.applyUI(state, myRole)
//   PowerEngine.applyKeyboard(state, myRole, keyEl, letter)
//   PowerEngine.applyHistory(entry, isSetter)
//

window.PowerEngine = {
  powers: {},

  register(id, mod) {
    this.powers[id] = mod;
  },

  applyUI(state, role) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (p.uiEffects) p.uiEffects(state, role);
    }
  },

  applyKeyboard(state, role, keyEl, letter) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (p.keyboardEffects) p.keyboardEffects(state, role, keyEl, letter);
    }
  },

  applyHistory(entry, isSetter) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (p.historyEffects) p.historyEffects(entry, isSetter);
    }
  }
};
