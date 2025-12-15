// /powers/powers/vowelRefresh.js
PowerEngine.register("vowelRefresh", {
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Vowel Refresh";
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_VOWEL_REFRESH" });
    };
  },

  historyEffects(entry, isSetter) {
    if (!entry.vowelRefreshApplied) return;
    if (!entry.vowelRefreshLetters) return;

    const letters = entry.vowelRefreshLetters;

    entry.fbGuesser = entry.fbGuesser.slice();
    entry.fb = entry.fb.slice();

    for (let i = 0; i < 5; i++) {
      const L = entry.guess[i].toUpperCase();
      if (letters.includes(L)) {
        entry.fbGuesser[i] = " ";
        entry.fb[i] = " ";
      }
    }
  },

  keyboardEffects(state, role, keyEl, letter) {
    const arr = state.powers.vowelRefreshLetters;
    if (!arr) return;
    if (arr.includes(letter)) {
      keyEl.classList.remove("key-green", "key-yellow", "key-gray", "key-blue");
    }
  }
});
