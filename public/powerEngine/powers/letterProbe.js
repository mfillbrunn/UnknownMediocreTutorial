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
      // Arm the on-screen keyboard: the guesser types 5 letters directly on
      // the coloured keyboard (no modal dimming the clues), then presses Enter.
      window.armPowerKeyboard?.("letterProbe");
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
