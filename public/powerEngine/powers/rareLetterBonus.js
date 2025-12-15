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
