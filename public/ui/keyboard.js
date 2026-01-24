// /public/ui/keyboard.js — PENDING-GUESS-ONLY VERSION

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

function getAgreedFeedbackAtIndex(h, i, isGuesser) {
  if (!isGuesser) return h.fb?.[i];

  if (!h.fakeFeedback) return h.fbGuesser?.[i];

  const r = h.fakeFeedback.real?.[i];
  const f = h.fakeFeedback.fake?.[i];

  return r === f ? r : null;
}

// Determine best letter status for color assignment
function getLetterStatusFromHistory(letter, state, isGuesser) {
  if (!state?.history) return null;
  
  const extraGreens = state.extraConstraints
  ?.filter(c => c.type === "GREEN")
  .map(c => c.letter);
  if (extraGreens?.includes(letter)) {
    return "green";
  }

  let strongest = null;
  const fbKey = isGuesser ? "fbGuesser" : "fb";

  for (const h of state.history) {
    if (!h?.guess || h.countOnlyApplied) continue;
    const guess = h.guess.toUpperCase();
    const fb = getAgreedFeedbackAtIndex(h, i, isGuesser);
    if (!fb) continue;
    if (!Array.isArray(fbArr)) continue;

    for (let i = 0; i < 5; i++) {
      if (h.hideTileApplied && h.hiddenIndices?.includes(i)) continue;

      const bsIdx = state.powers?.blindSpotIndex;
      const bsRound = state.powers?.blindSpotRoundIndex;
      if (
        isGuesser &&
        typeof bsIdx === "number" &&
        bsIdx === i &&
        typeof h.roundIndex === "number" &&
        h.roundIndex >= bsRound
      ) {
        continue;
      }

      if (guess[i] !== letter) continue;

      const fb = fbArr[i];
      if (fb === "🟩") strongest = "green";
      else if (fb === "🟨" && strongest !== "green") strongest = "yellow";
      else if (fb === "🟦" && !strongest) strongest = "blue";
      else if (fb === "⬛" && !strongest) strongest = "gray";
    }
  }

  return strongest;
}

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
      "key-current"
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
      const letter = symbol;

      // History coloring
      const status = getLetterStatusFromHistory(letter, state, isGuesser);
      if (status === "green") keyEl.classList.add("key-green");
      else if (status === "yellow") keyEl.classList.add("key-yellow");
      else if (status === "gray") keyEl.classList.add("key-gray");
      else if (status === "blue") keyEl.classList.add("key-blue");

      // Current submitted guess highlight
      if (guess.includes(letter)) {
        keyEl.classList.add("key-current");
      }

      keyEl.onclick = () => onInput({ type: "LETTER", value: letter });
    }
  }
};
