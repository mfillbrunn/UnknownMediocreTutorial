// /powers/powers/letterProbe.js — Recon Sweep (guesser)
PowerEngine.register("letterProbe", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.letterProbe.label,
    desc: window.POWER_METADATA.letterProbe.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } =
      PowerEngine.createPowerButton("letterProbe", window.POWER_METADATA.letterProbe.label);
    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      const input = $("letterProbeInput");
      const submit = $("letterProbeSubmitBtn");
      if (input) input.value = "";
      if (submit) submit.disabled = true;
      $("letterProbeModal")?.classList.add("active");
      input?.focus();
    };
  },

  uiEffects(state, role) {
    const btn = this.buttonEl;
    if (!btn) return;
    if (!state.activePowers?.includes("letterProbe")) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "";
    btn.disabled = !!state.powers?.letterProbeUsed;
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
  const input = $("letterProbeInput");
  const submit = $("letterProbeSubmitBtn");
  const cancel = $("letterProbeCancelBtn");
  if (!input || !submit || !cancel) return;

  const normalize = () => {
    // Letters only, uppercase, max 5.
    input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
    submit.disabled = input.value.length !== 5;
  };

  input.addEventListener("input", normalize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.length === 5) submit.click();
  });

  submit.onclick = () => {
    if (input.value.length !== 5) return;
    sendGameAction({ type: "USE_LETTER_PROBE", letters: input.value, role: "guesser" });
    $("letterProbeModal")?.classList.remove("active");
  };

  cancel.onclick = () => {
    $("letterProbeModal")?.classList.remove("active");
    input.value = "";
    submit.disabled = true;
  };
});

// Private result — only the guesser who swept receives this.
socket.on("letterProbeResult", ({ letters, count, distinctTested }) => {
  const spaced = (letters || "").split("").join(" ");
  const verb = count === 1 ? "is" : "are";
  window.showBigAnnounce?.({
    icon: "🔎",
    title: `Recon Sweep: ${count}/${distinctTested}`,
    sub: [`${count} of your letters ${verb} in the secret.`, `Tested: ${spaced}`],
    roleClass: "role-guesser",
    duration: 6000
  });
});
