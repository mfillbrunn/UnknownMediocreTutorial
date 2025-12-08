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

  for (const h of state.history) {
    const guess = h.guess.toUpperCase();
    const fbArr = h[fbKey];
    if (!fbArr) continue;

    for (let i = 0; i < 5; i++) {
      if (guess[i] !== letter) continue;

      const fb = fbArr[i];

      // BLUE IS TEMPORARY — only applies to this one history entry
      if (fb === "🟦") {
        // only mark as blue if we don't already have green or yellow from ANY turn
        if (!strongest || strongest === "gray" || strongest === "blue") {
          strongest = "blue";
        }
        continue;
      }

      // TRUE COLORS override blue
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

      // Letter keys
      if (/^[A-Z]$/.test(symbol)) {
        const letter = symbol;

        // Apply base history color:
        // RESET ALL COLOR CLASSES so new state can overwrite old ones
        keyEl.classList.remove("key-green", "key-yellow", "key-gray", "key-blue");
        
        // Apply updated color state
        const status = getLetterStatusFromHistory(letter, state, isGuesser);
        if (status === "green") keyEl.classList.add("key-green");
        else if (status === "yellow") keyEl.classList.add("key-yellow");
        else if (status === "gray") keyEl.classList.add("key-gray");
        else if (status === "blue") keyEl.classList.add("key-blue");

        // NOW allow power modules to modify this key:
        PowerEngine.applyKeyboard(state, target, keyEl, letter);

        keyEl.addEventListener("click", () => onKeyClick(letter, null));
      }

      rowDiv.appendChild(keyEl);
    });

    container.appendChild(rowDiv);
  });
};
