// Maps internal power ids to the <symbol id="icon-..."> defined in the
// inline SVG icon library (index.html, right after <body>). A power with
// no entry here just shows its label alone in the same badge card --
// intentional, not a bug, until that power gets an icon drawn for it.
const POWER_ICON_IDS = {
  // Spy (setter)
  hideTile: "icon-hide-evidence",
  suggestSecret: "icon-secret-word-helper",
  confuseColors: "icon-color-swap",
  countOnly: "icon-counts-only",
  blindSpot: "icon-foggy-tile",
  vowelRefresh: "icon-vowel-reset",
  blindGuess: "icon-total-blackout",
  fakeFeedback: "icon-fake-clue",
  delayedIntel: "icon-delayed-clue",
  forceTimer: "icon-time-pressure",

  // Inspector (guesser)
  suggestGuess: "icon-smart-guess-tip",
  rouletteSecret: "icon-secret-spin",
  revealHistory: "icon-time-rewind",
  stealthGuess: "icon-sneaky-guess",
  revealGreen: "icon-letter-peek",
  freezeSecret: "icon-lockdown",
  nonsense: "icon-silly-word",
  letterProbe: "icon-letter-scan",
  revealLocation: "icon-informant",
  letterProfile: "icon-letter-profile"
};

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
    btn.className = "power-btn power-badge";
    btn.title = label;

    // Vector icon from the inline <symbol> library, recolored via
    // currentColor (--role-accent) -- one icon works for both roles.
    const iconId = POWER_ICON_IDS[id];
    if (iconId) {
      const svgNS = "http://www.w3.org/2000/svg";
      const xlinkNS = "http://www.w3.org/1999/xlink";
      const icon = document.createElementNS(svgNS, "svg");
      icon.setAttribute("class", "power-icon");
      icon.setAttribute("viewBox", "0 0 120 120");
      const use = document.createElementNS(svgNS, "use");
      use.setAttributeNS(xlinkNS, "xlink:href", `#${iconId}`);
      use.setAttribute("href", `#${iconId}`);
      icon.appendChild(use);
      btn.appendChild(icon);
    }

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
