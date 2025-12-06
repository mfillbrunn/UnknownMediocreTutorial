// /public/ui/keyboard.js — NON-MODULE VERSION

// Make keyboard layout global
window.KEYBOARD_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["⌫","Z","X","C","V","B","N","M","ENTER"]
];

// --------------------------------------------
// Determine best feedback color from history
// --------------------------------------------
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

      // Priority: green > yellow > gray > blue
      if (fb === "🟩") best = "green";
      else if (fb === "🟨" && best !== "green") best = "yellow";
      else if (fb === "⬛" && !best) best = "gray";
      else if (fb === "🟦") best = "blue";
    }
  }

  return best;
}

// --------------------------------------------
// Render keyboard (global function)
// --------------------------------------------
window.renderKeyboard = function (state, container, target, onKeyClick) {
  container.innerHTML = "";

  const isGuesser = target === "guesser";
  const usedLetters = new Set();
  const reusePool = state?.powers?.reuseLettersPool || [];

  // Track letters guessed so far
  if (state?.history) {
    for (const h of state.history) {
      for (const ch of h.guess.toUpperCase()) {
        usedLetters.add(ch);
      }
    }
  }

  window.KEYBOARD_LAYOUT.forEach(row => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";

    row.forEach(symbol => {
      const key = document.createElement("div");
      key.className = "key";
      key.textContent = symbol;

      // -----------------
      // Special keys
      // -----------------
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

      // -----------------
      // Normal letter keys
      // -----------------
      const letter = symbol;

      if (/^[A-Z]$/.test(letter)) {
        // Setter sees red outline on letters guesser used
        if (target === "setter" && usedLetters.has(letter)) {
          key.classList.add("key-red-outline");
        }

        // Setter sees reuse pool letters as light gray
        if (target === "setter" && reusePool.includes(letter)) {
          key.style.background = "#bbb";
        }

        // Determine best color from history
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
};
