// --------------------------------------------------
// Reveal Penalty — shared renderer (MUST be global)
// --------------------------------------------------
function renderRevealPenaltyLetters(state) {
  const grid = document.querySelector(".letter-grid");
  const confirm = $("revealPenaltyConfirm");

  if (!grid || !confirm) return;

  grid.innerHTML = "";
  confirm.disabled = true;
  delete confirm.dataset.letter;

  const known = new Set();

  // Known letters from feedback
  for (const past of state.history ?? []) {
    for (let i = 0; i < 5; i++) {
      if (past.fb[i] === "🟩" || past.fb[i] === "🟨" || past.fb[i] === "⬛") {
        known.add(past.guess[i]);
      }
    }
  }

  // Known letters from constraints
  for (const c of state.extraConstraints ?? []) {
    if (c.letter) known.add(c.letter.toUpperCase());
  }

  // Render A–Z
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    const btn = document.createElement("button");
    btn.textContent = letter;
    btn.disabled = known.has(letter);

    btn.onclick = () => {
      document
        .querySelectorAll(".letter-grid button")
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
PowerEngine.register("revealPenalty", {
  role: "setter",
  tooltip: {
    title: window.POWER_METADATA.revealPenalty.label,
    desc: window.POWER_METADATA.revealPenalty.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } =
      PowerEngine.createPowerButton(
        "revealPenalty",
        window.POWER_METADATA.revealPenalty.label
      );

    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      renderRevealPenaltyLetters(window.uiState);
      $("revealPenaltyModal").classList.add("active");
    };
  },

  effects: {
    onPowerUsed() {
      const btn = this.buttonEl;
      if (!btn) return;

      btn.disabled = true;
      btn.classList.add("power-used");

      // Power FX
      document.body.classList.add("power-revealPenalty");
      setTimeout(() => {
        document.body.classList.remove("power-revealPenalty");
      }, 900);
    }
  }
});

// --------------------------------------------------
// Modal handlers
// --------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const confirm = $("revealPenaltyConfirm");

  confirm.onclick = () => {
    const letter = confirm.dataset.letter;
    if (!letter) return;

    sendGameAction({
      type: "USE_REVEAL_PENALTY",
      letter,
      role: "setter"
    });

    $("revealPenaltyModal").classList.remove("active");
  };

  $("revealPenaltyCancel").onclick = () => {
    $("revealPenaltyModal").classList.remove("active");
    confirm.disabled = true;
    delete confirm.dataset.letter;
  };
});

// --------------------------------------------------
// Info badge
// --------------------------------------------------
InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.revealPenaltyUsed) return null;

  const meta = POWER_METADATA.revealPenalty;
  const letter = state.powers.revealPenaltyLetter;

  return {
    id: "revealPenalty",
    emoji: meta.emoji,
    text: `${meta.label}: ${letter}`,
    color: meta.color,
    priority: 10,
    screen: role,
    details: meta.desc
  };
});
