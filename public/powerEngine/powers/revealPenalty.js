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
      renderRevealPenaltyLetters(state);
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
// Info badge — also doubles as the guesser's "call the bluff" button,
// same pattern as quest.js's claim badge. Calling the bluff means "this
// letter ISN'T really in the secret" -- resolved immediately server-side
// (resolveBluffCall in revealPenaltyServer.js). Caught -> free green
// letter (its own splash via the shared greenLetterRevealed handler in
// power-functions.js). Wrong -> the setter scores +2 and the letter is
// locked out of guesses for the rest of the round (see
// revealPenaltyCallResolved below for that announcement).
// --------------------------------------------------
InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.revealPenaltyUsed) return null;

  const meta = POWER_METADATA.revealPenalty;
  const letter = state.powers.revealPenaltyLetter;
  const called = state.powers.revealPenaltyCalled;
  const canCall = role === "guesser" && state.powers.revealPenaltyAwaitingCall && !called;

  let text = `${meta.label}: ${letter}`;
  let color = meta.color;

  if (called) {
    if (state.powers.revealPenaltyCallResult === "caught") {
      text = `Bluff called — ${letter} wasn't really there!`;
      color = "var(--tile-green)";
    } else {
      text = `Bluff call wrong — ${letter} was real, locked out this round`;
      color = "var(--setter-color)";
    }
  } else if (canCall) {
    text = `${meta.label}: ${letter} — tap to call bluff`;
  }

  return {
    id: "revealPenalty",
    emoji: meta.emoji,
    text,
    color,
    priority: 10,
    screen: role,
    details: meta.desc,
    clickable: canCall,
    onClick: canCall
      ? () => window.sendGameAction?.({ type: "USE_REVEAL_PENALTY_CALL", userId: window.currentUser?.id })
      : null
  };
});

// --------------------------------------------------
// Bluff call resolved. The "caught" outcome already gets its splash via
// the shared greenLetterRevealed handler (source: "bluffCaught") since it
// grants the same free-letter reward as everything else there; only the
// "wrong call" outcome needs its own announcement.
// --------------------------------------------------
socket.on("revealPenaltyCallResolved", ({ letter, result }) => {
  if (result !== "wrong") return;
  window.showBigAnnounce?.({
    icon: "❌",
    title: "Wrong call!",
    sub: `${letter} really was in the secret — it's locked out for the rest of the round.`,
    roleClass: "outcome-lose",
    duration: 4200
  });
});
