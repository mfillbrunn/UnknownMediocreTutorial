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

  const idx =
    typeof entry.revealPowerApplied === "number"
      ? entry.revealPowerApplied
      : entry.revealPowerApplied.index;

  //
  // ⭐ 1. Ensure fbGuesser exists
  //
  if (!Array.isArray(entry.fbGuesser)) {
    if (Array.isArray(entry.fb)) {
      entry.fbGuesser = entry.fb.slice();  // clone from fb
    } else {
      entry.fbGuesser = ["⬛","⬛","⬛","⬛","⬛"];
    }
  } else {
    entry.fbGuesser = entry.fbGuesser.slice();  // clone
  }

  //
  // ⭐ 3. Ensure fb exists for setter too
  //
  if (!Array.isArray(entry.fb)) {
    entry.fb = entry.fbGuesser.slice();  // fallback: use guesser fb
  } else {
    entry.fb = entry.fb.slice();
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
