// /public/ui/keyboard.js

// Layout for the on-screen keyboard
export const KEYBOARD_ROWS = [
  "QWERTYUIOP",
  "ASDFGHJKL",
  "ZXCVBNM"
];

/**
 * Render the keyboard for either the setter or guesser.
 *
 * @param {Object} state - full game state from server
 * @param {HTMLElement} container - DOM element to render into
 * @param {"setter"|"guesser"} target
 * @param {Function} onKeyClick - callback(letter) when a key is clicked
 */
export function renderKeyboard(state, container, target, onKeyClick) {
  container.innerHTML = "";

  const usedLetters = new Set();
  if (state && state.history) {
    for (const h of state.history) {
      for (const ch of h.guess.toUpperCase()) {
        usedLetters.add(ch);
      }
    }
  }

  const reusePool = state?.powers?.reuseLettersPool || [];

  KEYBOARD_ROWS.forEach(row => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";

    for (const ch of row) {
      const key = document.createElement("div");
      key.className = "key";
      key.textContent = ch;

      // Red outline: letters the guesser has used (setter view only)
      if (target === "setter" && usedLetters.has(ch)) {
        key.classList.add("key-red-outline");
      }

      // Reuse pool (setter special power: greyed letters available again)
      if (target === "setter" && reusePool.includes(ch)) {
        key.style.background = "#bbb";
      }

      // Keyboard coloring for guesser based on fbGuesser from last guess
      if (target === "guesser" && state?.history?.length > 0) {
        const last = state.history[state.history.length - 1];
        if (last && last.fbGuesser) {
          const guess = last.guess.toUpperCase();
          const f = last.fbGuesser;

          for (let i = 0; i < 5; i++) {
            if (guess[i] === ch) {
              if (f[i] === "🟩") key.classList.add("key-green");
              if (f[i] === "🟨") key.classList.add("key-yellow");
              if (f[i] === "⬛") key.classList.add("key-gray");
              if (f[i] === "🟦") {
                key.style.background = "#75a7ff";
                key.style.color = "white";
              }
            }
          }
        }
      }

      key.addEventListener("click", () => onKeyClick(ch));
      rowDiv.appendChild(key);
    }

    container.appendChild(rowDiv);
  });
}
