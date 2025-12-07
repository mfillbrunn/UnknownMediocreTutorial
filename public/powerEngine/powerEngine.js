//
// /public/powerEngine/powerEngine.js
// FINAL PRODUCTION VERSION
//
// This engine manages:
//   - Rendering power buttons
//   - Enabling/disabling based on game state
//   - Forwarding state/UI updates to power modules
//   - Role-based restrictions
//   - One-power-per-turn rule
//   - Preventing use during simultaneous + gameOver
//

window.PowerEngine = {
  powers: {},          // { powerId: module }
  _initialized: false, // ensures buttons render once

  // -------------------------------------------------------------
  // Register a power module
  // Each module may define:
  //   role: "setter" | "guesser"
  //   renderButton(roomId)
  //   uiEffects(state, role)
  //   keyboardEffects(...)
  //   historyEffects(...)
  //   patternEffects(...)
  //   mustContainEffects(...)
  // -------------------------------------------------------------
  register(id, mod) {
    this.powers[id] = mod;
  },

  // -------------------------------------------------------------
  // Render buttons once (each power allocates its own button)
  // -------------------------------------------------------------
  renderButtons(roomId) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.renderButton) mod.renderButton(roomId);
    }
  },

  // -------------------------------------------------------------
  // Apply UI updates from every module + central button logic
  // -------------------------------------------------------------
  applyUI(state, role) {
    // First, run individual module UI effects
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.uiEffects) mod.uiEffects(state, role);
    }

    // Then apply global enabling/disabling rules
    this.updateButtonStates(state, role);
  },

  // -------------------------------------------------------------
  // Keyboard modifications for powers (optional per module)
  // -------------------------------------------------------------
  applyKeyboard(state, role, keyEl, letter) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.keyboardEffects) mod.keyboardEffects(state, role, keyEl, letter);
    }
  },

  // -------------------------------------------------------------
  // History modifications (optional per module)
  // -------------------------------------------------------------
  applyHistoryEffects(entry, isSetter) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.historyEffects) mod.historyEffects(entry, isSetter);
    }
  },

  // -------------------------------------------------------------
  // Pattern modifications (optional per module)
  // -------------------------------------------------------------
  applyPattern(state, isSetterView, patternArray) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.patternEffects) mod.patternEffects(state, isSetterView, patternArray);
    }
  },

  // -------------------------------------------------------------
  // Must-contain modifications (optional per module)
  // -------------------------------------------------------------
  applyMustContain(state, arr) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.mustContainEffects) mod.mustContainEffects(state, arr);
    }
  },

  // ====================================================================
  // ⭐ CENTRAL POWER BUTTON LOGIC
  // ====================================================================
  //
  // A power button should be enabled ONLY IF:
  //   - Not used before (`state.powers[id + "Used"] === false`)
  //   - It is normal phase
  //   - It is THIS PLAYER'S TURN
  //   - No power was used this turn
  //   - Correct role (setter-only / guesser-only)
  // ====================================================================
  updateButtonStates(state, role) {
    const isSetter = (role === state.setter);
    const isGuesser = (role === state.guesser);
    const isMyTurn = (state.phase === "normal" && state.turn === role);

    const globallyLocked =
      state.phase === "simultaneous" ||
      state.phase === "gameOver" ||
      state.powerUsedThisTurn;

    for (const id in this.powers) {
      const mod = this.powers[id];
      if (!mod.buttonEl) continue; // Button not registered yet

      let disable = false;

      // 1) Global lock
      if (globallyLocked) disable = true;

      // 2) Power already used in this match?
      if (state.powers[id + "Used"] === true) disable = true;

      // 3) Must be player's turn
      if (!isMyTurn) disable = true;

      // 4) Role restriction
      if (mod.role === "setter" && !isSetter) disable = true;
      if (mod.role === "guesser" && !isGuesser) disable = true;

      // Apply disabled state
      mod.buttonEl.disabled = disable;
      mod.buttonEl.classList.toggle("disabled-btn", disable);
    }
  }
};
