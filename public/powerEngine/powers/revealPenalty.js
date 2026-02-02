PowerEngine.register("revealPenalty", {
  role: "setter",
  tooltip: {
    title: window.POWER_METADATA.revealPenalty.label,
    desc: window.POWER_METADATA.revealPenalty.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } =
      PowerEngine.createPowerButton("revealPenalty", window.POWER_METADATA.revealPenalty.label);

    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      $("revealPenaltyModal").classList.add("active");
    };
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
  const grid = document.querySelector(".letter-grid");
  const confirm = $("revealPenaltyConfirm");
  let selected = null;

  function renderLetters(state) {
    grid.innerHTML = "";
    const known = new Set();

    for (const past of state.history ?? []) {
      for (let i = 0; i < 5; i++) {
        if (past.fb[i] === "🟩" || past.fb[i] === "🟨") {
          known.add(past.guess[i]);
        }
      }
    }

    for (const c of state.extraConstraints ?? []) {
      if (c.letter) known.add(c.letter);
    }

    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      const btn = document.createElement("button");
      btn.textContent = letter;
      btn.disabled = known.has(letter);

      btn.onclick = () => {
        document.querySelectorAll(".letter-grid button")
          .forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        selected = letter;
        confirm.disabled = false;
      };

      grid.appendChild(btn);
    }
  }

  confirm.onclick = () => {
    if (!selected) return;

    sendGameAction({
      type: "USE_REVEAL_PENALTY",
      letter: selected,
      role: "setter"
    });

    $("revealPenaltyModal").classList.remove("active");
  };

  $("revealPenaltyCancel").onclick = () => {
    $("revealPenaltyModal").classList.remove("active");
    selected = null;
    confirm.disabled = true;
  };

  // Call renderLetters(uiState) when opening modal
});

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
