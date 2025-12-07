PowerEngine.register("reuseLetters", {

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_reuseLetters";
    btn.className = "power-btn";
    btn.textContent = "Reuse Letters";
    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_REUSELETTERS" });
  },

  keyboardEffects(state, role, keyEl, letter) {
    const pool = state.powers?.reuseLettersPool || [];
    if (pool.includes(letter)) {
      keyEl.classList.remove("key-gray");
      keyEl.style.background = "#bbb"; // highlight unlocked letter
    }
  }
});
