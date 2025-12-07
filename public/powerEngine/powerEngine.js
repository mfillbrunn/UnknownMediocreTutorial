// /public/powerEngine/powerEngine.js
//
// Central client-side power engine. Fully modular.
//
// Powers may provide any of these hooks:
//
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
  },

  applyPattern(state, isSetterView, patternArray) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (p.patternEffects) p.patternEffects(state, isSetterView, patternArray);
    }
  },

  applyMustContain(state, arr) {
    for (const id in this.powers) {
      const p = this.powers[id];
      if (p.mustContainEffects) p.mustContainEffects(state, arr);
    }
  }
};
