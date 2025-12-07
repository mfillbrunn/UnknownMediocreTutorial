PowerEngine.register("reuseLetters", {

  // ⭐ REQ: Setter is the one who activates this power
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_reuseLetters";
    btn.className = "power-btn";
    btn.textContent = "Reuse Letters";

    $("setterPowerContainer").appendChild(btn);

    // ⭐ REQ: Needed for powerEngine.js to control disabled / used states
    this.buttonEl = btn;

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_REUSELETTERS" });
  },

  // Highlight letters the setter chooses to reuse
  keyboardEffects(state, role, keyEl, letter) {
    const pool = state.powers?.reuseLettersPool || [];

    if (pool.includes(letter)) {
      keyEl.classList.remove("key-gray");
      keyEl.style.background = "#bbb";  // highlight unlocked letter
    }
  }
});
