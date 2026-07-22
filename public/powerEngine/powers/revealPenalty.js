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
  const resolved = state.powers.revealPenaltyResolved;

  if (resolved) {
    const result = state.powers.revealPenaltyResult;
    let text = `${meta.label}: ${letter}`;
    let color = meta.color;

    if (result === "accepted") {
      text = `${letter} accepted — Spy scored +1`;
    } else if (result === "wrongCall") {
      text = `Called ${letter}, but it was true — Spy scored +2`;
      color = "var(--setter-color)";
    } else if (result === "bluffCaught") {
      text = `Called ${letter} — it was a bluff!`;
      color = "var(--tile-yellow)";
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
      text: `${meta.label}: claims ${letter} is in the secret`,
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
      text: `Accept: ${letter} is in the secret (Spy scores +1)`,
      color: meta.color,
      priority: 10,
      screen: "guesser",
      details: "Trust the claim without checking it -- the Spy scores 1 point either way.",
      clickable: true,
      onClick: () => window.sendGameAction?.({ type: "USE_REVEAL_PENALTY_ACCEPT", userId: window.currentUser?.id })
    },
    {
      id: "revealPenaltyCall",
      emoji: "🚨",
      text: `Call bluff on ${letter}`,
      color: "var(--setter-color)",
      priority: 11,
      screen: "guesser",
      details: "Right, and you get a free yellow letter. Wrong, and the Spy scores 2 points.",
      clickable: true,
      onClick: () => window.sendGameAction?.({ type: "USE_REVEAL_PENALTY_CALL", userId: window.currentUser?.id })
    }
  ];
});

// --------------------------------------------------
// Claim resolved. "accepted"/"wrongCall" just get a quiet toast/splash
// here; "bluffCaught" also announces the free yellow letter it granted
// (if the secret had no letters left to reward, yellowLetter is null and
// that line is simply omitted).
// --------------------------------------------------
socket.on("revealPenaltyResolved", ({ letter, result, yellowLetter }) => {
  if (result === "accepted") {
    toast(`${letter} accepted — the Spy scores +1.`);
    return;
  }

  if (result === "wrongCall") {
    window.showBigAnnounce?.({
      icon: "❌",
      title: "Wrong call!",
      sub: `${letter} really was in the secret — the Spy scores +2.`,
      roleClass: "outcome-lose",
      duration: 4200
    });
    return;
  }

  if (result === "bluffCaught") {
    window.showBigAnnounce?.({
      icon: "🟨",
      title: "Bluff caught!",
      sub: [
        `${letter} wasn't really in the secret.`,
        yellowLetter ? `${yellowLetter} is somewhere in the secret.` : null
      ],
      roleClass: "outcome-win",
      duration: 4200
    });
  }
});
