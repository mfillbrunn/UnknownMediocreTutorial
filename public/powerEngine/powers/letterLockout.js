// --------------------------------------------------
// Power registration (setter)
// --------------------------------------------------
// The letter itself is picked server-side (see pickLockoutLetter in
// letterLockoutServer.js -- random, never repeats, prefers a letter
// that's never been guessed at all), so there's no grid to pick from
// here anymore, just a direct confirm-and-fire.
PowerEngine.register("letterLockout", {
  role: "setter",
  tooltip: {
    title: window.POWER_METADATA.letterLockout.label,
    desc: window.POWER_METADATA.letterLockout.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } =
      PowerEngine.createPowerButton(
        "letterLockout",
        window.POWER_METADATA.letterLockout.label
      );

    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      $("letterLockoutModal").classList.add("active");
    };
  }

  // No `effects.onPowerUsed` — unlike a one-shot power, this one stays
  // usable every round. Leaving it out means updateButtonStates()'s
  // generic logic (which only permanently disables a button when
  // state.powers[id + "Used"] is true — a field this power never sets)
  // naturally re-enables it as soon as it's the setter's next decision
  // turn, with no custom re-enable code needed here.
});

// --------------------------------------------------
// Modal handlers
// --------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const confirm = $("letterLockoutConfirm");

  confirm.onclick = () => {
    sendGameAction({
      type: "USE_LETTER_LOCKOUT",
      role: "setter"
    });

    $("letterLockoutModal").classList.remove("active");
  };

  $("letterLockoutCancel").onclick = () => {
    $("letterLockoutModal").classList.remove("active");
  };
});

// --------------------------------------------------
// Info badge — shown on BOTH screens: the guesser needs to know what
// they can't type, and the setter gets a standing confirmation of what
// they just picked.
// --------------------------------------------------
InfoBadgeEngine.register((state, role) => {
  const letter = state.powers?.letterLockoutBanned;
  if (!letter) return null;

  const meta = POWER_METADATA.letterLockout;

  return {
    id: "letterLockout",
    emoji: meta.emoji,
    text: `${meta.label}: ${letter}`,
    color: meta.color,
    priority: 15,
    screen: "both",
    details: meta.desc
  };
});
