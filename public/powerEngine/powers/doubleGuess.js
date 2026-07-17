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
      const a = $("doubleGuessInput1");
      const b = $("doubleGuessInput2");
      if (a) a.value = "";
      if (b) b.value = "";
      const submit = $("doubleGuessSubmitBtn");
      if (submit) submit.disabled = true;
      $("doubleGuessModal")?.classList.add("active");
      a?.focus();
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

document.addEventListener("DOMContentLoaded", () => {
  const a = $("doubleGuessInput1");
  const b = $("doubleGuessInput2");
  const submit = $("doubleGuessSubmitBtn");
  const cancel = $("doubleGuessCancelBtn");
  if (!a || !b || !submit || !cancel) return;

  const clean = (el) => {
    el.value = el.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  };
  const refresh = () => {
    clean(a); clean(b);
    const okA = a.value.length === 5 && window.ALLOWED_GUESSES?.has(a.value);
    const okB = b.value.length === 5 && window.ALLOWED_GUESSES?.has(b.value);
    submit.disabled = !(okA && okB);
  };

  a.addEventListener("input", refresh);
  b.addEventListener("input", refresh);
  a.addEventListener("keydown", (e) => { if (e.key === "Enter") b.focus(); });
  b.addEventListener("keydown", (e) => { if (e.key === "Enter" && !submit.disabled) submit.click(); });

  submit.onclick = () => {
    const g1 = a.value, g2 = b.value;
    if (g1.length !== 5 || g2.length !== 5) return;
    if (!window.ALLOWED_GUESSES?.has(g1) || !window.ALLOWED_GUESSES?.has(g2)) {
      toast("Both must be valid words");
      return;
    }
    sendGameAction({ type: "USE_DOUBLE_GUESS", guess1: g1, guess2: g2, role: "guesser" });
    $("doubleGuessModal")?.classList.remove("active");
  };

  cancel.onclick = () => {
    $("doubleGuessModal")?.classList.remove("active");
    submit.disabled = true;
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
