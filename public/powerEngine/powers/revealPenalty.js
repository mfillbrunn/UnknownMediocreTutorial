// --------------------------------------------------
// Reveal Penalty — shared renderer (MUST be global)
// --------------------------------------------------
function renderRevealPenaltyLetters(state) {
  const grid = document.querySelector(".letter-grid");
  const countRow = $("revealPenaltyCountRow");
  const confirm = $("revealPenaltyConfirm");

  if (!grid || !countRow || !confirm) return;

  grid.innerHTML = "";
  countRow.innerHTML = "";
  confirm.disabled = true;
  delete confirm.dataset.letter;
  delete confirm.dataset.count;

  const updateConfirmState = () => {
    confirm.disabled = !(confirm.dataset.letter && confirm.dataset.count);
  };

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
      updateConfirmState();
    };

    grid.appendChild(btn);
  }

  // Render 1–5 (claimed occurrence count)
  for (let n = 1; n <= 5; n++) {
    const btn = document.createElement("button");
    btn.textContent = n;

    btn.onclick = () => {
      countRow
        .querySelectorAll("button")
        .forEach(b => b.classList.remove("selected"));

      btn.classList.add("selected");
      confirm.dataset.count = n;
      updateConfirmState();
    };

    countRow.appendChild(btn);
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
    const count = confirm.dataset.count;
    if (!letter || !count) return;

    sendGameAction({
      type: "USE_REVEAL_PENALTY",
      letter,
      count: Number(count),
      role: "setter"
    });

    $("revealPenaltyModal").classList.remove("active");
  };

  $("revealPenaltyCancel").onclick = () => {
    $("revealPenaltyModal").classList.remove("active");
    confirm.disabled = true;
    delete confirm.dataset.letter;
    delete confirm.dataset.count;
  };
});

// --------------------------------------------------
// Info badge — also doubles as the guesser's Accept/Call response, same
// pattern as quest.js's claim badge. While the claim is unresolved, the
// guesser sees TWO clickable badges (Accept / Call Bluff) since
// InfoBadgeEngine collectors may return an array. Once resolved, both
// screens fall back to a single static result line. Always resolved
// immediately server-side (resolveClaim in revealPenaltyServer.js) --
// there's no deferred/game-end outcome to show here.
// --------------------------------------------------
InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.revealPenaltyUsed) return null;

  const meta = POWER_METADATA.revealPenalty;
  const letter = state.powers.revealPenaltyLetter;
  const count = state.powers.revealPenaltyCount;
  const resolved = state.powers.revealPenaltyResolved;

  if (resolved) {
    const result = state.powers.revealPenaltyResult;
    let text = `${meta.label}: ${letter}×${count}`;
    let color = meta.color;

    if (result === "accepted") {
      text = `${letter}×${count} accepted — Spy scored +${count}`;
    } else if (result === "trueCall") {
      text = `Called ${letter}×${count}, but it was true — Spy scored +${count * 2}`;
      color = "var(--setter-color)";
    } else if (result === "bluffCaught") {
      text = `Called ${letter}×${count} — it was a bluff!`;
      color = "var(--tile-green)";
    }

    return {
      id: "revealPenalty",
      emoji: meta.emoji,
      text,
      color,
      priority: 10,
      screen: role,
      details: meta.desc
    };
  }

  if (role !== "guesser") {
    return {
      id: "revealPenalty",
      emoji: meta.emoji,
      text: `${meta.label}: claims ${letter}×${count}`,
      color: meta.color,
      priority: 10,
      screen: role,
      details: meta.desc
    };
  }

  return [
    {
      id: "revealPenaltyAccept",
      emoji: "✅",
      text: `Accept ${letter}×${count} (Spy scores +${count})`,
      color: meta.color,
      priority: 10,
      screen: "guesser",
      details: "Trust the claim without checking it -- the Spy scores this many points either way.",
      clickable: true,
      onClick: () => window.sendGameAction?.({ type: "USE_REVEAL_PENALTY_ACCEPT", userId: window.currentUser?.id })
    },
    {
      id: "revealPenaltyCall",
      emoji: "🚨",
      text: `Call bluff on ${letter}×${count}`,
      color: "var(--setter-color)",
      priority: 11,
      screen: "guesser",
      details: "Right, and you get a free green letter. Wrong, and the Spy scores double.",
      clickable: true,
      onClick: () => window.sendGameAction?.({ type: "USE_REVEAL_PENALTY_CALL", userId: window.currentUser?.id })
    }
  ];
});

// --------------------------------------------------
// Claim resolved. The "bluffCaught" outcome already gets its splash via
// the shared greenLetterRevealed handler (source: "bluffCaught") since it
// grants the same free-letter reward as everything else there; the other
// two outcomes get their own announcement here.
// --------------------------------------------------
socket.on("revealPenaltyResolved", ({ letter, count, result }) => {
  if (result === "accepted") {
    toast(`${letter}×${count} accepted — the Spy scores +${count}.`);
    return;
  }

  if (result === "trueCall") {
    window.showBigAnnounce?.({
      icon: "❌",
      title: "Wrong call!",
      sub: `${letter} really did appear ${count}× — the Spy scores double (+${count * 2}).`,
      roleClass: "outcome-lose",
      duration: 4200
    });
  }
});
