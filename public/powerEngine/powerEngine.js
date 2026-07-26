window.PowerEngine = {
  powers: {},
  _initialized: false,
  _buttonsRendered: false,

  register(id, mod) {
    this.powers[id] = mod;
  },

  createPowerButton(id, label) {
    const wrapper = document.createElement("div");
    wrapper.className = "power-btn-wrapper";

    const btn = document.createElement("button");
    btn.className = "power-btn power-btn-icon";
    btn.title = label;

    // Icon image (assets/powers/icons/<id>.png) with the power's label
    // printed below it. If a power doesn't have an icon yet, onerror just
    // drops the <img> -- the label alone still renders in the same
    // enlarged, borderless layout, so a partial icon set degrades
    // gracefully instead of needing a hardcoded list of "which ids have art".
    const img = document.createElement("img");
    img.className = "power-btn-img";
    img.src = `assets/powers/icons/${id}.png`;
    img.alt = label;
    img.onerror = () => img.remove();
    btn.appendChild(img);

    const labelEl = document.createElement("span");
    labelEl.className = "power-btn-label";
    labelEl.textContent = label;
    btn.appendChild(labelEl);

    const meta = this.powers[id]?.tooltip;
    if (meta) {
      wrapper.addEventListener("mouseenter", () => {
        showTooltip(wrapper, meta);
      });
      wrapper.addEventListener("mouseleave", hideTooltip);
    }

    wrapper.appendChild(btn);
    return { wrapper, btn };
  },

  renderButtons(roomId) {
    if (this._buttonsRendered) return;
    this._buttonsRendered = true;

    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.renderButton) {
        mod.renderButton(roomId);
      }
    }
  },

  applyUI(state, role, userId) {
    for (const id in this.powers) {
      const mod = this.powers[id];
      if (mod.uiEffects) mod.uiEffects(state, role, userId);
    }

    this.updateButtonStates(state, role, userId);
  },

  updateButtonStates(state, role, userId) {
  const isSetter = role === "setter";
  const isGuesser = role === "guesser";
  const isMyTurn = state.phase === "normal" && state.turn === userId;

  for (const id in this.powers) {
    const mod = this.powers[id];
    const btn = mod.buttonEl;
    if (!btn) continue;

    if (state.activePowers && !state.activePowers.includes(id)) {
      if (mod.wrapperEl) mod.wrapperEl.style.display = "none";
      continue;
    } else {
      if (mod.wrapperEl) mod.wrapperEl.style.display = "";
    }

    const rule = window.POWER_RULES?.[id];
    const notAllowedByRule =
      rule && typeof rule.allowed === "function"
        ? rule.allowed(state, role) !== true
        : false;

    const wrongRole =
      (mod.role === "setter" && !isSetter) ||
      (mod.role === "guesser" && !isGuesser);

    const isPermanentlyUsed = state.powers?.[id + "Used"] === true;
    const powerUsedThisTurn = state.powerUsedThisTurn === true;
    const notNormalPhase = state.phase !== "normal";
    const shouldBeDisabled =
      wrongRole ||
      notNormalPhase ||
      !isMyTurn ||
      notAllowedByRule;

    if (isPermanentlyUsed) {
      btn.disabled = true;
      btn.classList.add("power-used");
      btn.classList.remove("disabled-btn");
      continue;
    }

    if (powerUsedThisTurn) {
      btn.disabled = true;
      btn.classList.add("disabled-btn");
      btn.classList.remove("power-used");
      continue;
    }

    if (shouldBeDisabled) {
      btn.disabled = true;
      btn.classList.add("disabled-btn");
      btn.classList.remove("power-used");
      continue;
    }

    btn.disabled = false;
    btn.classList.remove("disabled-btn");
    btn.classList.remove("power-used");
  }
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
  }
};
