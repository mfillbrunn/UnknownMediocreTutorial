// /powers/powers/rareLetterBonus.js
PowerEngine.register("rareLetterBonus", {
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Rare Letter Bonus";
    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_RARE_LETTER_BONUS" });
    };
  },

  historyEffects(entry, isSetter) {
    if (!entry.rareBonusApplied) return;
    if (!isSetter && entry.fbGuesser) {
      entry.fbGuesser = entry.fbGuesser.slice();
      const i = entry.rareBonusApplied;
      entry.fbGuesser[i] = "🟩";
    }
  },
  uiEffects(state, role) {
  if (!this.buttonEl) return;            // button not created yet
  if (role !== "guesser") {              
    this.buttonEl.style.display = "none";
    return;
  }
  if (!state.activePowers.includes("rareLetterBonus")) {
   this.buttonEl.style.display = "none";
   return;
}

  // Always show for guesser (Option B), but disable unless ready
  this.buttonEl.style.display = "";

  const ready = state.powers.rareLetterBonusReady;
  const used = state.powers.rareLetterBonusUsed;
  const turn = state.turn === state.guesser;
  const phase = state.phase === "normal";

  if (ready && !used && turn && phase) {
    // ENABLE BUTTON
    this.buttonEl.disabled = false;
    this.buttonEl.classList.remove("disabled-btn");
  } else {
    // DISABLE BUTTON
    this.buttonEl.disabled = true;
    this.buttonEl.classList.add("disabled-btn");
  }
},

  keyboardEffects(state, role, keyEl, letter) {
    const set = state.powers.guesserLockedGreens;
    if (role !== "guesser") return;
    if (!set) return;
    if (set.includes(letter)) {
      keyEl.classList.remove("key-yellow", "key-gray", "key-blue");
      keyEl.classList.add("key-green");
    }
  }
});
