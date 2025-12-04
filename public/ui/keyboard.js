// /public/ui/keyboard.js

// Keyboard layout including Backspace + Enter
export const KEYBOARD_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["⌫","Z","X","C","V","B","N","M","ENTER"]
];

/**
 * Determine the highest-priority final color for a letter
 * from the full game history.
 *
 * Priority: green > yellow > gray > blue
 */
function getLetterStatusFromHistory(letter, state, isGuesser) {
  if (!state?.history) return null;

  let best = null;
  const fbKey = isGuesser ? "fbGuesser" : "fb";

  for (const h of state.history) {
    const guess = h.guess.toUpperCase();
    const fbArr = h[fbKey];
    if (!fbArr) continue;

    for (let i = 0; i < 5; i++) {
      if (guess[i] !== letter) continue;

      const fb = fbArr[i];

      // Sorted by priority
      if (fb === "🟩") best = "green";
      else if (fb === "🟨" && best !== "green") best = "yellow";
      else if (fb === "⬛" && !best) best = "gray";
      else if (fb === "🟦") best = "blue"; // confuseColors
    }
  }

  return best;
}

/**
 * Render the on-screen keyboard for either setter or guesser.
 * 
 * onKeyClick(letter, special)
 *   letter = actual character (A-Z)
 *   special = "BACKSPACE" or "ENTER" or null
 */
export function renderKeyboard(state, container, target, onKeyClick) {
  container.innerHTML = "";

  const isGuesser = target === "guesser";
  const usedLetters = new Set();
  const reusePool = state?.powers?.reuseLettersPool || [];

  // Setter sees letters guesser used (red outline)
  if (state?.history) {
    for (const h of state.history) {
      for (const ch of h.guess.toUpperCase()) {
        usedLetters.add(ch);
      }
    }
  }

  KEYBOARD_LAYOUT.forEach(row => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";

    row.forEach(symbol => {
      const key = document.createElement("div");
      key.className = "key";
      key.textContent = symbol;

      // Special keys — handled separately
      if (symbol === "⌫") {
        key.classList.add("key-special");
        key.addEventListener("click", () => onKeyClick(null, "BACKSPACE"));
        rowDiv.appendChild(key);
        return;
      }

      if (symbol === "ENTER") {
        key.classList.add("key-special");
        key.addEventListener("click", () => onKeyClick(null, "ENTER"));
        rowDiv.appendChild(key);
        return;
      }

      // Letter keys
      const letter = symbol;
      const isLetter = /^[A-Z]$/.test(letter);

      if (isLetter) {
        // Setter sees outline for letters guesser has used
        if (target === "setter" && usedLetters.has(letter)) {
          key.classList.add("key-red-outline");
        }

        // reuseLetters pool overrides greying (setter only)
        if (target === "setter" && reusePool.includes(letter)) {
          key.style.background = "#bbb";
        }

        // Determine best status from all history
        const best = getLetterStatusFromHistory(letter, state, isGuesser);
        if (best === "green")  key.classList.add("key-green");
        if (best === "yellow") key.classList.add("key-yellow");
        if (best === "gray")   key.classList.add("key-gray");
        if (best === "blue") {
          key.style.background = "#75a7ff";
          key.style.color = "white";
        }

        key.addEventListener("click", () => onKeyClick(letter, null));
      }

      rowDiv.appendChild(key);
    });

    container.appendChild(rowDiv);
  });
}
