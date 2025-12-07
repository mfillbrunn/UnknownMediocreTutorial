PowerEngine.register("reuseLetters", {
  keyboardEffects(state, role, keyEl, letter) {
    const pool = state.powers.reuseLettersPool || [];
    if (!pool.length) return;

    if (pool.includes(letter.toUpperCase())) {
      // Make letter reusable
      keyEl.classList.remove("key-gray");
      keyEl.classList.add("key-reusable");
    }
  }
});
