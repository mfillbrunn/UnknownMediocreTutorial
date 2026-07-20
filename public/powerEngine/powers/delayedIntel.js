// /powers/powers/delayedIntel.js — Delayed Intel (setter)
//
// One-time use, activated during the setter's own decision turn. Delays
// only the round about to be decided -- the guesser won't see its
// feedback until they've submitted their next guess. The masking itself
// happens entirely server-side (server/utils/delayedFeedback.js and its
// call sites), so this file just renders the activation button and an
// info badge for as long as that one round stays withheld.
PowerEngine.register("delayedIntel", {
  role: "setter",
  tooltip: {
    title: window.POWER_METADATA.delayedIntel.label,
    desc: window.POWER_METADATA.delayedIntel.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } = PowerEngine.createPowerButton("delayedIntel", window.POWER_METADATA.delayedIntel.label);
    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction({ type: "USE_DELAYED_INTEL" });
    };
  },

  effects: {
    onPowerUsed(data) {
      const btn = this.buttonEl;
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  }
});

InfoBadgeEngine.register((state, role) => {
  const affected = state.powers?.delayedIntelRoundIndex;
  if (typeof affected !== "number") return null;

  const total = state.history?.length || 0;
  if (total <= affected) return null;

  // Mirrors server/utils/delayedFeedback.js's guesserVisibleHistoryCount:
  // once a later round exists, or the guesser has submitted their next
  // guess, the delayed round has already unlocked -- stop showing the badge.
  const unlocked = total > affected + 1 || (total === affected + 1 && !!state.pendingGuess);
  if (unlocked) return null;

  const meta = window.POWER_METADATA.delayedIntel;
  return {
    id: "delayedIntel",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
