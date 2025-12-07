window.PowerEngine = {
  powers: {},
  _initialized: false,

  register(id, mod) {
    this.powers[id] = mod;
  },

  renderButtons(roomId) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.renderButton) mod.renderButton(roomId);
    }
  },

  applyUI(state, role) {
    // First run module-specific UI
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.uiEffects) mod.uiEffects(state, role);
    }

    // Then globally update enabled/disabled state of buttons
    this.updateButtonStates(state, role);
  },

  applyKeyboard(state, role, keyEl, letter) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.keyboardEffects) mod.keyboardEffects(state, role, keyEl, letter);
    }
  },

  applyHistoryEffects(entry, isSetter) {
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
  },

  // --------------------------------------------------------
  // ⭐ NEW SECTION: Button availability logic
  // --------------------------------------------------------
  updateButtonStates(state, role) {
    const isSetter = (role === state.setter);
    const isGuesser = (role === state.guesser);

    const turnIsMine =
      (state.phase === "normal" && state.turn === role);

    const lockAll =
      state.phase === "gameOver" ||
      state.phase === "simultaneous" ||
      state.powerUsedThisTurn;

    for (const id in this.powers) {
      const mod = this.powers[id];
      if (!mod.buttonEl) continue;

      // Default: enable or disable based on conditions
      let disabled = false;

      // Global locks
      if (lockAll) disabled = true;

      // Power already used this match?
      if (state.powers[id + "Used"] === true) disabled = true;

      // Turn mismatch?
      if (state.phase === "normal" && !turnIsMine) disabled = true;

      // Wrong role (Setter-only or Guesser-only)
      if (mod.role === "setter" && !isSetter) disabled = true;
      if (mod.role === "guesser" && !isGuesser) disabled = true;

      // Apply to DOM
      mod.buttonEl.disabled = disabled;
      mod.buttonEl.classList.toggle("disabled-btn", disabled);
    }
  }
};
