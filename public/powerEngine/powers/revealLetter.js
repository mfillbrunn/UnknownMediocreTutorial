// /powers/powers/revealLetter.js
PowerEngine.register("revealLetter", {
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Reveal Letter";  // will be renamed based on mode
    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      // Normalized by powerEngineServer.normalizePowerId → "revealLetter"
      sendGameAction(roomId, { type: "USE_REVEAL_LETTER" });
    };
  },

  uiEffects(state, role) {
    const btn = this.buttonEl;
    if (!btn) return;

    // Hide if this power is not active this match
    if (!state.activePowers || !state.activePowers.includes("revealLetter")) {
      btn.style.display = "none";
      return;
    }

    // Only guesser sees the button
    if (role !== state.guesser) {
      btn.style.display = "none";
      return;
    }

    btn.style.display = "";

    // Button label depends on mode
    const mode = state.powers?.revealLetter?.mode;
    if (mode === "RARE") {
      btn.textContent = "Rare Letter Bonus";
    } else if (mode === "ROW") {
      btn.textContent = "Row Master";
    } else {
      btn.textContent = "Reveal Letter";
    }

    // ENABLE/DISABLE is handled centrally in powerEngine.updateButtonStates
    // based on POWER_RULES["revealLetter"].allowed(...)
  },

  // History decoration: ensure the revealed index is green in guesser view
  historyEffects(entry, isSetter) {
    if (!entry.revealPowerApplied) return;

    // server can store either a number or { index, mode }
    const idx = typeof entry.revealPowerApplied === "number"
      ? entry.revealPowerApplied
      : entry.revealPowerApplied.index;

    if (!isSetter && Array.isArray(entry.fbGuesser)) {
      entry.fbGuesser = entry.fbGuesser.slice();
      entry.fbGuesser[idx] = "🟩";  // correct
entry.fb[idx] = "🟩";         // setter sees it too

    }
  },

  // Keyboard decoration: lock revealed letters as green
  keyboardEffects(state, role, keyEl, letter) {
    if (role !== "guesser") return;

    const locked = state.powers?.guesserLockedGreens;
    if (!Array.isArray(locked)) return;

    if (locked.includes(letter.toUpperCase())) {
      keyEl.classList.remove("key-yellow", "key-gray", "key-blue");
      keyEl.classList.add("key-green");
    }
  }
});
