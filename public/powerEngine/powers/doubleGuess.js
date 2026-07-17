// /powers/powers/doubleGuess.js — Double Tap (guesser)
PowerEngine.register("doubleGuess", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.doubleGuess.label,
    desc: window.POWER_METADATA.doubleGuess.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } =
      PowerEngine.createPowerButton("doubleGuess", window.POWER_METADATA.doubleGuess.label);
    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      // Arm the on-screen keyboard: the guesser types the two words directly
      // on the coloured keyboard (no modal), one after the other.
      window.armPowerKeyboard?.("doubleGuess");
    };
  },

  uiEffects(state, role) {
    const btn = this.buttonEl;
    if (!btn) return;
    if (!state.activePowers?.includes("doubleGuess")) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "";
    btn.disabled = !!state.powers?.doubleGuessUsed;
  },

  effects: {
    onPowerUsed() {
      const btn = this.buttonEl;
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  }
});

// Setter status: while a Double Tap is pending resolution, the setter sees a
// persistent badge telling them the power fired (they still only see one of
// the two guesses as the pending guess).
InfoBadgeEngine.register((state, role) => {
  if (role !== "setter") return null;
  if (!state.powers?.doubleGuessPending) return null;
  const meta = POWER_METADATA.doubleGuess;
  return {
    id: "doubleGuessPending",
    emoji: meta.emoji,
    text: `${meta.label}: a second hidden guess is in play`,
    color: meta.color,
    priority: 9,
    screen: "setter",
    details: meta.desc
  };
});

// Private confirmation for the guesser: both guesses + their real feedback.
socket.on("doubleGuessResult", ({ guesses }) => {
  if (!Array.isArray(guesses)) return;
  const lines = guesses.map(g => `${g.guess}  ${Array.isArray(g.fb) ? g.fb.join("") : ""}`);
  window.showBigAnnounce?.({
    icon: "🎯",
    title: "Double Tap fired!",
    sub: lines,
    roleClass: "role-guesser",
    duration: 6000
  });
});
