//
// /public/powerEngine/powerEngine.js
// FINAL VERSION — Option A (Two disabled states) with U3 permanent USED styling
//

window.PowerEngine = {
  powers: {},
  _initialized: false,

  register(id, mod) {
    this.powers[id] = mod;
  },

  // Render power buttons once
  renderButtons(roomId) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.renderButton) mod.renderButton(roomId);
    }
  },

  // Called on each stateUpdate
  applyUI(state, role) {
    // run module-specific visuals first
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.uiEffects) mod.uiEffects(state, role);
    }

    // then run global power availability
    this.updateButtonStates(state, role);
  },

  // -------------------------------------------------------------
  // ⭐ CENTRAL BUTTON LOGIC (3 states: active, disabled, used)
  // -------------------------------------------------------------
  updateButtonStates(state, role) {
    const isSetter = (role === state.setter);
    const isGuesser = (role === state.guesser);
    const isMyTurn = (state.phase === "normal" && state.turn === role);

    const temporaryLock =
      state.phase !== "normal" ||      // simultaneous, gameOver, lobby
      state.powerUsedThisTurn;         // another power was used this turn

    for (const id in this.powers) {
      const mod = this.powers[id];
      const btn = mod.buttonEl;
      if (!btn) continue;

      // Determine permanent vs temporary disable
      const isPermanentlyUsed = state.powers[id + "Used"] === true;

      const wrongRole =
        (mod.role === "setter" && !isSetter) ||
        (mod.role === "guesser" && !isGuesser);

      const isTemporarilyDisabled =
        !isPermanentlyUsed && (
          temporaryLock ||
          !isMyTurn ||
          wrongRole
        );

      // ------------------------------------------------------
      // APPLY VISUAL STATES
      // ------------------------------------------------------

      // 1. Permanent USED (U3 Style)
      if (isPermanentlyUsed) {
        btn.disabled = true;
        btn.classList.add("power-used");     // strike-through + grey
        btn.classList.remove("disabled-btn");
        continue; // nothing else applied
      }

      // 2. Temporary Disabled
      if (isTemporarilyDisabled) {
        btn.disabled = true;
        btn.classList.add("disabled-btn");
        btn.classList.remove("power-used");
        continue;
      }

      // 3. Active (usable)
      btn.disabled = false;
      btn.classList.remove("disabled-btn");
      btn.classList.remove("power-used");
    }
  }
};
