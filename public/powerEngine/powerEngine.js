// Maps internal power ids to the <symbol id="icon-..."> defined in the
// inline SVG icon library (index.html, right after <body>). A power with
// no entry here just shows its label alone in the same badge card --
// intentional, not a bug, until that power gets an icon drawn for it.
const POWER_ICON_IDS = {
  // Secretkeeper (setter)
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

  // Guesser (guesser)
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

// Powers with more than one charge per match show a small "uses left /
// total" chip on their button (e.g. "2/2", dropping to "1/2" after the
// first activation) so it's clear another use is still available instead
// of reading as a normal one-shot power.
const POWER_MAX_USES = {
  hideTile: 2,
  revealGreen: 2
};

// Published so other surfaces that show a power outside the normal button
// tray (e.g. Power Choice's reward cards) can render the same icon rather
// than falling back to an emoji stand-in.
window.POWER_ICON_IDS = POWER_ICON_IDS;
function applyPowerPalette(
  element,
  powerId
) {
  if (!element || !powerId) {
    return;
  }

  const fallbackColor =
    window.POWER_METADATA?.[
      powerId
    ]?.color;

  const configured =
    window.POWER_PALETTES?.[
      powerId
    ];

  // Two colors max per card, deliberately. The palettes below still list
  // three for some powers, but a row of cards each showing three
  // saturated stops read as visual noise -- the eye had nowhere to rest.
  // Capping here (rather than editing every palette) keeps the data as
  // documentation of a power's "theme" while the UI only ever spends two
  // of them; --power-color-3 just mirrors the second one.
  const colors = (
    Array.isArray(configured)
      ? configured
      : [fallbackColor]
  )
    .filter(
      color =>
        typeof color === "string" &&
        color.trim()
    )
    .slice(0, 2);

  if (!colors.length) {
    return;
  }

  const first = colors[0];

  const second =
    colors[1] || first;

  const third =
    colors[2] || second;

  element.classList.add(
    "power-themed"
  );

  element.dataset.powerId =
    powerId;

  element.dataset.paletteSize =
    String(colors.length);

  element.style.setProperty(
    "--power-color-1",
    first
  );

  element.style.setProperty(
    "--power-color-2",
    second
  );

  element.style.setProperty(
    "--power-color-3",
    third
  );
}

window.applyPowerPalette =
  applyPowerPalette;
// Shared by power buttons (below) and quest.js's badge tile. .power-btn-label
// reserves a fixed-height 2-line box in CSS (components.css) so every badge
// card ends up the same overall size regardless of label length -- this
// shrinks the font-size in steps until a long label (e.g. "Secret Word
// Helper", "Hard Mode Streak") actually fits inside that fixed box instead
// of overflowing it. Runs on the next frame since scrollHeight is only
// meaningful once the element has real layout, which requires it to
// already be in the document -- callers append the returned wrapper
// synchronously right after creation, so by the time this fires the label
// is already live.
const BADGE_LABEL_SIZES = [11, 10, 9, 8, 7.2, 6.5, 6];
function fitBadgeLabel(labelEl, attemptsLeft) {
  if (attemptsLeft === undefined) {
    labelEl.style.fontSize = "";
    attemptsLeft = 30;
  }
  requestAnimationFrame(() => {
    if (!labelEl.isConnected) return;
    // renderButtons() can run before the button's screen has actually been
    // shown (#setterScreen/#guesserScreen start hidden and get toggled on
    // later) -- while any ancestor is display:none, clientHeight and
    // scrollHeight both read 0, so the check below would wrongly conclude
    // "already fits" on the very first frame and never shrink long labels
    // at all. Keep waiting (bounded) for it to actually become visible
    // instead of measuring a collapsed box.
    if (labelEl.offsetParent === null) {
      if (attemptsLeft > 0) fitBadgeLabel(labelEl, attemptsLeft - 1);
      return;
    }
    const maxHeight = labelEl.clientHeight;
    if (labelEl.scrollHeight <= maxHeight + 1) return;
    // Check AFTER setting each size, not before -- this list assumes the
    // CSS default it starts shrinking from is 11px (components.css's
    // desktop-reference box). mobile.css's smaller powers-col card starts
    // its label at 8px instead, so checking-then-setting (the old order)
    // read that already-small 8px as "still too big" and set it to the
    // list's first entry (11px) -- LARGER than what was already there --
    // before working back down. Setting first and checking after always
    // moves monotonically toward the smallest size that actually fits.
    for (const size of BADGE_LABEL_SIZES) {
      labelEl.style.fontSize = size + "px";
      if (labelEl.scrollHeight <= maxHeight + 1) break;
    }
  });
}
window.fitBadgeLabel = fitBadgeLabel;

// Finds the most recent server power-event for a given power id, so a used
// power's button can show its concrete result (e.g. "position 3 = R" for
// Letter Peek) instead of just sitting there marked used. Checks the
// still-pending live events first (this turn's guess hasn't resolved into
// history yet), then walks history newest-first, including archived
// rounds (state.history is wiped at each round boundary).
function findLatestPowerEvent(state, powerId) {
  const live = Array.isArray(window._livePowerEvents) ? window._livePowerEvents : [];
  for (let i = live.length - 1; i >= 0; i--) {
    if (live[i]?.id === powerId) return live[i];
  }
  const rounds = [
    ...(Array.isArray(state?.matchRounds) ? state.matchRounds : []),
    { history: state?.history }
  ];
  for (let r = rounds.length - 1; r >= 0; r--) {
    const history = rounds[r]?.history || [];
    for (let i = history.length - 1; i >= 0; i--) {
      const events = history[i]?.powerEvents || [];
      for (let j = events.length - 1; j >= 0; j--) {
        if (events[j]?.id === powerId) return events[j];
      }
    }
  }
  return null;
}

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
const btn =
  document.createElement(
    "button"
  );

btn.className =
  "power-btn power-badge";

btn.title = label;

applyPowerPalette(
  btn,
  id
);


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
    fitBadgeLabel(labelEl);

    const maxUses = POWER_MAX_USES[id];
    if (maxUses) {
      const usesEl = document.createElement("span");
      usesEl.className = "power-uses-badge";
      usesEl.textContent = `${maxUses}/${maxUses}`;
      btn.appendChild(usesEl);
    }

    const meta = this.powers[id]?.tooltip;
    if (meta) {
      wrapper.addEventListener("mouseenter", () => {
        showTooltip(wrapper, meta);
      });
      wrapper.addEventListener("mouseleave", hideTooltip);
    }

    // Tapping/clicking no longer fires the power directly -- it opens an
    // info popup (title/desc) with an explicit Use button instead. Power
    // modules still just do `btn.onclick = fn` exactly as before (see
    // e.g. blindGuess.js) -- this property override quietly redirects
    // that assignment into `useHandler` rather than the DOM's native
    // onclick, so nothing in any individual power file needs to change.
    // A disabled button never dispatches "click" at all (browser-level,
    // regardless of listener type), so this still only ever fires while
    // the power is actually usable, exactly mirroring the old direct-
    // activation gate -- it's just an extra tap away now.
    let useHandler = null;
    Object.defineProperty(btn, "onclick", {
      configurable: true,
      get() { return useHandler; },
      set(fn) { useHandler = fn; }
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // A power can optionally compute its own popup content right at
      // click time (e.g. Vowel Refresh previewing exactly which vowels
      // it would reset, or disabling Use when it would do nothing) --
      // see vowelRefresh.js's getActionPopup for the shape it returns.
      const override = this.powers[id]?.getActionPopup?.(window.state, window.myRole) || {};
      window.showPowerActionPopup?.({
        emoji: window.POWER_METADATA?.[id]?.emoji,
        title: meta?.title || window.POWER_METADATA?.[id]?.label || label,
        desc: meta?.desc || window.POWER_METADATA?.[id]?.desc || "",
        ...override,
        onUse: () => useHandler?.()
      });
    });

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
    const lockedBySpyCharge =
      window.isSpyPowerChargeLocked?.(
        id,
        state
      ) === true;
    const maxUses = POWER_MAX_USES[id];
    if (maxUses) {
      const usesEl = btn.querySelector(".power-uses-badge");
      if (usesEl) {
        const spent = state.powers?.[id + "Uses"] || 0;
        usesEl.textContent = `${Math.max(maxUses - spent, 0)}/${maxUses}`;
      }
    }

    const isPermanentlyUsed = state.powers?.[id + "Used"] === true;
    const powerUsedThisTurn = state.powerUsedThisTurn === true;
    const notNormalPhase = state.phase !== "normal";
    const shouldBeDisabled =
      wrongRole ||
      lockedBySpyCharge ||
      notNormalPhase ||
      !isMyTurn ||
      notAllowedByRule;

    if (isPermanentlyUsed) {
      btn.disabled = true;
      btn.classList.add("power-used");
      btn.classList.remove("disabled-btn");

      const labelEl = btn.querySelector(".power-btn-label");
      if (labelEl) {
        const evt = findLatestPowerEvent(state, id);
        const formatted = evt && window.formatPowerEvent?.(evt);
        const resultText =
          formatted?.ownText && formatted.ownText !== formatted.label
            ? formatted.ownText
            : null;
        const cacheKey = resultText || "";
        if (labelEl.dataset.resultShown !== cacheKey) {
          labelEl.dataset.resultShown = cacheKey;
          if (resultText) {
            labelEl.textContent = resultText;
            fitBadgeLabel(labelEl);
          }
        }
      }
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
