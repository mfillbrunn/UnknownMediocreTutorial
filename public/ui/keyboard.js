// /public/ui/keyboard.js — SERVER-DRIVEN VERSION

function buildKeyboard(container) {
  container.innerHTML = "";

  KEYBOARD_LAYOUT.forEach(row => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";

    row.forEach(symbol => {
      const keyEl = document.createElement("div");
      keyEl.className = "key";
      keyEl.dataset.key = symbol;
      keyEl.textContent = symbol === "ENTER" ? "⏎" : symbol;

      rowDiv.appendChild(keyEl);
    });

    container.appendChild(rowDiv);
  });

  container.__keys = [...container.querySelectorAll(".key")];
}

window.KEYBOARD_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["ENTER","Z","X","C","V","B","N","M","⌫"]
];

window.renderKeyboard = function ({
  state,
  container,
  pendingGuess,
  isGuesser,
  onInput
}) {
  if (!container.__keys) {
    buildKeyboard(container);
  }

  const guess = (pendingGuess || "").toUpperCase();

  for (const keyEl of container.__keys) {
    const symbol = keyEl.dataset.key;

    keyEl.classList.remove(
      "key-green",
      "key-yellow",
      "key-gray",
      "key-blue",
      "key-current",
      "key-uncertain",
      "key-banned"
    );

    // Special keys
    if (symbol === "⌫") {
      keyEl.onclick = () => onInput({ type: "BACKSPACE" });
      continue;
    }

    if (symbol === "ENTER") {
      keyEl.onclick = () => onInput({ type: "ENTER" });
      continue;
    }

    if (/^[A-Z]$/.test(symbol)) {
      const status = state.keyboard?.[symbol];

      if (status === "green") keyEl.classList.add("key-green");
      else if (status === "yellow") keyEl.classList.add("key-yellow");
      else if (status === "gray") keyEl.classList.add("key-gray");
      else if (status === "blue") keyEl.classList.add("key-blue");

      // Count Only power: letter was guessed but its true color is
      // unknown — looks like an untouched key, plus a small "?" mark.
      if (!status && state.keyboardUncertain?.[symbol]) {
        keyEl.classList.add("key-uncertain");
      }

      // highlight letters currently typed
      if (guess.includes(symbol)) {
        keyEl.classList.add("key-current");
      }

      // Letter Lockout (setter power): only the GUESSER's next guess is
      // restricted — mark it on their keyboard only, not the setter's own
      // (which would misleadingly imply the setter's typing is affected
      // too, when it's only a preview of what they just banned).
      if (isGuesser && state.powers?.letterLockoutBanned === symbol) {
        keyEl.classList.add("key-banned");
      }

      keyEl.onclick = () => onInput({ type: "LETTER", value: symbol });
    }
  }
};
