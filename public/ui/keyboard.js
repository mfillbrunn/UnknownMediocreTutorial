// /public/ui/keyboard.js — MODULAR VERSION

window.KEYBOARD_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["","A","S","D","F","G","H","J","K","L",""],
  ["⌫","Z","X","C","V","B","N","M","ENTER"]
];

// Determine best letter status for color assignment
function getLetterStatusFromHistory(letter, state, isGuesser) {
  if (!state?.history) return null;
  let strongest = null;
  const fbKey = isGuesser ? "fbGuesser" : "fb";
  for (let idx = 0; idx < state.history.length; idx++) {
    const h = state.history[idx];
   if (h.countOnlyApplied) continue;
    const guess = h.guess.toUpperCase();
    const fbArr = h[fbKey];
    if (!fbArr) continue;
    for (let i = 0; i < 5; i++) {
      if (guess[i] !== letter) continue;
      const fb = fbArr[i];
      if (fb === "🟦") {
        if (!strongest || strongest === "gray" || strongest === "blue") {
          strongest = "blue";
        }
        continue;
      }
      if (fb === "🟩") {
        strongest = "green";
        continue;
      }
      if (fb === "🟨") {
        if (strongest !== "green") strongest = "yellow";
        continue;
      }
      if (fb === "⬛") {
        if (!strongest) strongest = "gray";
      }
    }
  }
  return strongest;
}

window.renderKeyboard = function (state, container, target, onKeyClick) {
  container.innerHTML = "";

  const isGuesser = target === "guesser";

  // ========================================================
  // Determine suppression behavior for this turn
  // ========================================================
  let suppressColoring = false;
  let hiddenLetters = new Set();     // <--- DEFINE HERE (GLOBAL TO FUNCTION)

  if (state.history && state.history.length > 0) {
    const last = state.history[state.history.length - 1];
       // HIDE TILE suppresses only letters in hidden positions
    if (last.hideTileApplied && Array.isArray(last.hiddenIndices)) {
      const guess = last.guess.toUpperCase();
      last.hiddenIndices.forEach(i => {
        hiddenLetters.add(guess[i]);   // <--- add letters to suppress
      });
    }
  }


  KEYBOARD_LAYOUT.forEach(row => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";

    row.forEach(symbol => {

      // Invisible spacing
      if (symbol === "") {
        const spacer = document.createElement("div");
        spacer.className = "key spacer-key";
        spacer.style.visibility = "hidden";
        rowDiv.appendChild(spacer);
        return;
      }

      const keyEl = document.createElement("div");
      keyEl.className = "key";
      keyEl.textContent = symbol;

      // Special keys
      if (symbol === "⌫") {
        keyEl.addEventListener("click", () => onKeyClick(null, "BACKSPACE"));
        rowDiv.appendChild(keyEl);
        return;
      }

      if (symbol === "ENTER") {
        keyEl.addEventListener("click", () => onKeyClick(null, "ENTER"));
        rowDiv.appendChild(keyEl);
        return;
      }

      // LETTER KEYS
      if (/^[A-Z]$/.test(symbol)) {
        const letter = symbol;

        // Reset previous color classes
        keyEl.classList.remove("key-green", "key-yellow", "key-gray", "key-blue", "key-current");

        // =============================================
        // SUPPRESS COLORING on CountOnly / HideTile turn
        // =============================================
                if (!suppressColoring) {
          
              // HIDE TILE: skip coloring ONLY for hidden letters
              if (!hiddenLetters.has(letter)) {
                  const status = getLetterStatusFromHistory(letter, state, isGuesser);
                  if (status === "green") keyEl.classList.add("key-green");
                  else if (status === "yellow") keyEl.classList.add("key-yellow");
                  else if (status === "gray") keyEl.classList.add("key-gray");
                  else if (status === "blue") keyEl.classList.add("key-blue");
              }
        }

        // Setter: highlight letters in pending guess
        if (!isGuesser && state.pendingGuess) {
          const pending = state.pendingGuess.toUpperCase();
          if (pending.includes(letter)) {
            keyEl.classList.add("key-current");
          }
        }

        // Allow power modules to adjust the key
        PowerEngine.applyKeyboard(state, target, keyEl, letter);

        keyEl.addEventListener("click", () => onKeyClick(letter, null));
      }

      rowDiv.appendChild(keyEl);
    });

    container.appendChild(rowDiv);
  });
};
