//
// /public/powerEngine/powerEngine.js
// FINAL — buttons show USED / disabled based on:
//  - powerUsedThisTurn
//  - state.powers[powerId + "Used"]
//  - whether it's this player's turn
//  - phase (only usable in normal)
//

window.PowerEngine = {
  powers: {},
  _initialized: false,

  register(id, mod) {
    this.powers[id] = mod;
  },

  // Render all power buttons once
  renderButtons(roomId) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.renderButton) mod.renderButton(roomId);
    }
  },

  // Called on every stateUpdate from the server
  applyUI(state, role) {
    // Let each power do its own extra visuals if needed
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.uiEffects) mod.uiEffects(state, role);
    }

    // Then centralise button enabling / "used" logic
    this.updateButtonStates(state, role);
  },

  // -------------------------------------------------------------
  // ⭐ Central button logic
  // -------------------------------------------------------------
  updateButtonStates(state, role) {
    const isSetter = (role === state.setter);
    const isGuesser = (role === state.guesser);
    const isMyTurn = (state.phase === "normal" && state.turn === role);
    const rule = window.POWER_RULES?.[id];
    const notAllowedByRule =
    rule && typeof rule.allowed === "function" && !rule.allowed(state, role);

    for (const id in this.powers) {
      const mod = this.powers[id];
      const btn = mod.buttonEl;
      if (!btn) continue;

      // Role restriction (setter powers only visible/active for setter, etc.)
      const wrongRole =
        (mod.role === "setter" && !isSetter) ||
        (mod.role === "guesser" && !isGuesser);

      // Has this specific power been used earlier in the match?
      const isPermanentlyUsed = state.powers[id + "Used"] === true;

      // Global / turn-based conditions that should make it non-usable this turn
      const anotherPowerUsedThisTurn = state.powerUsedThisTurn;
      const notNormalPhase = state.phase !== "normal";
      
      // Your rule:
      // a power should be "used"/disabled if:
      //  - this or another power used this turn
      //  - OR it was used before in the match
      //  - OR it is not the player's turn
      //
      const shouldBeDisabled =
        wrongRole ||
        isPermanentlyUsed ||
        anotherPowerUsedThisTurn ||
        notNormalPhase ||
        !isMyTurn ||
        notAllowedByRule;;

      // ------------------------------------------------------
      // VISUAL STATES
      // ------------------------------------------------------

      // 1) Permanently used (U3 style: grey + strike-through)
      if (isPermanentlyUsed) {
        btn.disabled = true;
        btn.classList.add("power-used");
        btn.classList.remove("disabled-btn");
        continue;
      }

      // 2) Temporarily disabled (this turn, wrong phase/turn/role)
      if (shouldBeDisabled) {
        btn.disabled = true;
        btn.classList.add("disabled-btn");
        btn.classList.remove("power-used");
        continue;
      }

      // 3) Active / usable
      btn.disabled = false;
      btn.classList.remove("disabled-btn");
      btn.classList.remove("power-used");
    }
  },

  // Optional keyboard hook
  applyKeyboard(state, role, keyEl, letter) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.keyboardEffects) mod.keyboardEffects(state, role, keyEl, letter);
    }
  },

  // Optional history styling
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
  }
};
