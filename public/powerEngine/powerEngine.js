// /public/powerEngine/powerEngine.js
//
// Central client-side power engine.
// Each power module may define:
//
//   renderButton(roomId)
//   uiEffects(state, role)
//   keyboardEffects(state, role, keyEl, letter)
//   historyEffects(entry, isSetter)
//   patternEffects(state, isSetterView, patternArray)
//   mustContainEffects(state, mustContainArray)
//

window.PowerEngine = {
  powers: {},
  _initialized: false,

  register(id, mod) {
    this.powers[id] = mod;
  },

  // Render all power buttons (each module handles its own UI)
  renderButtons(roomId) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.renderButton) mod.renderButton(roomId);
    }
  },

  applyUI(state, role) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.uiEffects) mod.uiEffects(state, role);
    }
  },

  applyKeyboard(state, role, keyEl, letter) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.keyboardEffects) mod.keyboardEffects(state, role, keyEl, letter);
    }
  },

  applyHistory(entry, isSetter) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.historyEffects) mod.historyEffects(entry, isSetter);
    }
  },

  applyPattern(state, isSetterView, patternArray) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.patternEffects) mod.patternEffects(state, isSetterView, patternArray);
    }
  },

  applyMustContain(state, arr) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.mustContainEffects) mod.mustContainEffects(state, arr);
    }
  }
};
