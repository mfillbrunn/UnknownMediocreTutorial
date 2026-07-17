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

// Info badge: shown for the rest of the turn (state.powers.letterProbeResult
// is cleared once the following guess is scored — by then the result has
// moved to a permanent line in the action log instead, see action-log.js).
InfoBadgeEngine.register((state, role) => {
  if (role !== "guesser") return null;
  if (!state.activePowers?.includes("letterProbe")) return null;
  const result = state.powers?.letterProbeResult;
  if (!result) return null;

  const meta = POWER_METADATA.letterProbe;
  const verb = result.count === 1 ? "is" : "are";
  return {
    id: "letterProbeResult",
    emoji: meta.emoji,
    text: `${meta.label}: ${result.count}/${result.distinctTested} ${verb} in the secret`,
    color: meta.color,
    priority: 10,
    screen: "guesser",
    details: meta.desc
  };
});

// Private result — only the guesser who swept receives this. Kept as an
// immediate popup on top of the badge/log, which is the persistent record.
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
