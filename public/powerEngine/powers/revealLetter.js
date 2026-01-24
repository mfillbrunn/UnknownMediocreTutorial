// /powers/powers/revealLetter.js
PowerEngine.register("revealLetter", {
  role: "guesser",

  renderButton(roomId) {
    const { wrapper, btn } =
    PowerEngine.createPowerButton("revealLetter", "Reveal Letter");

  this.wrapperEl = wrapper;
  this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      // Normalized by powerEngineServer.normalizePowerId → "revealLetter"
      sendGameAction({ type: "USE_REVEAL_LETTER" });
    };
  
// Tooltip hooks (variant-aware)
    const showVariantTooltip = () => {
      const mode = window.state?.powers?.revealLetter?.mode;
      const meta =
        window.POWER_METADATA?.revealLetter?.variants?.[mode];

      if (!meta) return;

      showTooltip(btn, {
        title: meta.label,
        desc: meta.desc
      });
    };

    btn.addEventListener("mouseenter", showVariantTooltip);
    btn.addEventListener("focus", showVariantTooltip);
    btn.addEventListener("mouseleave", hideTooltip);
    btn.addEventListener("blur", hideTooltip);
  },

  uiEffects(state, role) {
    const btn = this.buttonEl;
    if (!btn) return;

    // Hide if this power is not active this match
    if (!state.activePowers || !state.activePowers.includes("revealLetter")) {
      btn.style.display = "none";
      return;
    }

    // Only guesser sees the button
    if (role !== state.guesser) {
      btn.style.display = "none";
      return;
    }

    btn.style.display = "";

    // Button label depends on mode
    const mode = state.powers?.revealLetter?.mode;
    if (mode === "RARE") {
      btn.textContent = "Rare Letter Bonus";
    } else if (mode === "ROW") {
      btn.textContent = "Row Master";
    } else {
      btn.textContent = "Reveal Letter";
    }
  }
});

// --------------------------------------------------
// Reveal Letter — info badge (both players)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  const meta = POWER_METADATA.revealLetter;
  if (!state.powers?.revealLetterActive) return null;
  const greens = state.extraConstraints?.filter(
    c => c.type === "GREEN" && typeof c.index === "number"
  );

  if (!greens || greens.length === 0) return null;
   const last = greens[greens.length - 1];
  return {
    id: "revealLetter",
    emoji: meta.emoji ?? "🟩",
    text: `${meta.label}: position ${last.index + 1} = ${last.letter}`,
    color: meta.color,
    priority: 12,
    screen: "both",
    details: meta.desc
  };
});

