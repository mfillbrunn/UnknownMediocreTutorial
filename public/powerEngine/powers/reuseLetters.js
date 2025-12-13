/*PowerEngine.register("reuseLetters", {

  // Setter activates this power
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_reuseLetters";
    btn.className = "power-btn";
    btn.textContent = "Reuse Letters";

    $("setterPowerContainer").appendChild(btn);

    this.buttonEl = btn;

    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_REUSE_LETTERS" });
    };
  },

  // Highlight letters the setter can reuse
  keyboardEffects(state, role, keyEl, letter) {
    const pool = state.powers?.reuseLettersPool || [];

    if (pool.includes(letter)) {
      keyEl.classList.remove("key-gray");
      keyEl.style.background = "#bbb";
    }
  }
});
