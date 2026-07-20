// --------------------------------------------------
// Letter Lockout — shared renderer (MUST be global)
// --------------------------------------------------
// Scoped to #letterLockoutModal specifically — revealPenalty.js's own
// renderer queries the bare ".letter-grid" class globally, which would
// grab whichever grid appears first in the DOM if this one used the same
// unscoped selector.
function renderLetterLockoutLetters(state) {
  const grid = document.querySelector("#letterLockoutModal .letter-grid");
  const confirm = $("letterLockoutConfirm");

  if (!grid || !confirm) return;

  grid.innerHTML = "";
  confirm.disabled = true;
  delete confirm.dataset.letter;

  const used = new Set(state.powers?.letterLockoutUsedLetters || []);
  // Already confirmed green/yellow -- the guesser is entitled to use it,
  // so it can't be banned (mirrors the server-side guard in
  // letterLockoutServer.js).
  const known = new Set(state.constraintData?.mustContain || []);

  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    const btn = document.createElement("button");
    btn.textContent = letter;
    btn.disabled = used.has(letter) || known.has(letter);
    if (known.has(letter) && !used.has(letter)) {
      btn.title = "Already confirmed green/yellow -- can't be banned";
      btn.classList.add("letter-lockout-known");
    }
    // Same colors the real keyboard shows for this letter, so the setter
    // can see at a glance which letters are still worth banning.
    btn.classList.add("picker-" + (state.keyboard?.[letter] || "unused"));

    btn.onclick = () => {
      document
        .querySelectorAll("#letterLockoutModal .letter-grid button")
        .forEach(b => b.classList.remove("selected"));

      btn.classList.add("selected");
      confirm.dataset.letter = letter;
      confirm.disabled = false;
    };

    grid.appendChild(btn);
  }
}

// --------------------------------------------------
// Power registration (setter)
// --------------------------------------------------
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
      renderLetterLockoutLetters(state);
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
    const letter = confirm.dataset.letter;
    if (!letter) return;

    sendGameAction({
      type: "USE_LETTER_LOCKOUT",
      letter,
      role: "setter"
    });

    $("letterLockoutModal").classList.remove("active");
  };

  $("letterLockoutCancel").onclick = () => {
    $("letterLockoutModal").classList.remove("active");
    confirm.disabled = true;
    delete confirm.dataset.letter;
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
