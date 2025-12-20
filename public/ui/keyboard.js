// /public/ui/keyboard.js — MODULAR VERSION
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

  // store references for future updates
  container.__keys = [...container.querySelectorAll(".key")];
}


const lastDraftMap = new WeakMap();

window.KEYBOARD_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["ENTER","Z","X","C","V","B","N","M","⌫"]
];

// Determine best letter status for color assignment
function getLetterStatusFromHistory(letter, state, isGuesser) {
  if (!state?.history) return null;
  // ⭐ NEW: forced greens take absolute precedence
  // vowelRefresh turns these letters "new" again
const eff = state.powers?.vowelRefreshEffect;
if (eff) {
  for (const pos of eff.indices) {
    if (state.history[eff.guessIndex]?.guess[pos].toUpperCase() === letter) {
      return null;  // treat as unused
    }
  }
}

const forcedGreens = state.powers?.forcedGreens || {};
  // Skip reading history if this letter forced green
if (Object.values(forcedGreens).includes(letter))
    return "green";
  const blindIdx = state.powers?.blindSpotIndex;
  let strongest = null;
  const fbKey = isGuesser ? "fbGuesser" : "fb";
  for (let idx = 0; idx < state.history.length; idx++) {
    const h = state.history[idx];
     if (!h || !h.guess) continue; 
   if (h.countOnlyApplied) continue;
    const guess = h.guess.toUpperCase();
    const fbArr = h[fbKey];
    if (!Array.isArray(fbArr)) continue;
    for (let i = 0; i < 5; i++) {
    
      // Skip this tile ONLY if it was hidden by HideTile
      if (h.hideTileApplied && Array.isArray(h.hiddenIndices)) {
        if (h.hiddenIndices.includes(i)) continue;
      }
      // BLIND SPOT: ignore this tile for ALL FUTURE ROUNDS after blindSpotRoundIndex
      const bsIdx = state.powers?.blindSpotIndex;
      const bsRound = state.powers?.blindSpotRoundIndex;
      if (
       isGuesser &&
       typeof bsIdx === "number" &&
          bsIdx === i &&
            typeof h.roundIndex === "number" &&
           h.roundIndex >= bsRound
          ) {
            // Skip feedback for this tile
            continue;
          }
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
window.renderKeyboard = function ({
  state,
  container,
  draft,
  isGuesser,
  onInput
}) {

  if (!container.__keys) {
    buildKeyboard(container);
  }
    // ========================================================
  // Determine suppression behavior for this turn
  // ========================================================
  let suppressColoring = false;
  for (const keyEl of container.__keys) {
  const symbol = keyEl.dataset.key;

  // Clear dynamic classes
  keyEl.classList.remove(
    "key-green",
    "key-yellow",
    "key-gray",
    "key-blue",
    "key-current",
    "key-animate"
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

  // Letter keys
  if (/^[A-Z]$/.test(symbol)) {
    const letter = symbol;

    // --- History coloring ---
    if (!suppressColoring) {
      const status = getLetterStatusFromHistory(letter, state, isGuesser);
      if (status === "green") keyEl.classList.add("key-green");
      else if (status === "yellow") keyEl.classList.add("key-yellow");
      else if (status === "gray") keyEl.classList.add("key-gray");
      else if (status === "blue") keyEl.classList.add("key-blue");
    }
    const lastDraft = lastDraftMap.get(container) || "";
    const wasInLast = lastDraft.includes(letter);
    const isInNow = draft.includes(letter);
    if (isInNow) {
      keyEl.classList.add("key-current");

      if (!wasInLast) {
        keyEl.classList.add("key-animate");
        keyEl.addEventListener(
          "animationend",
          () => keyEl.classList.remove("key-animate"),
          { once: true }
        );
      }
    }

    keyEl.onclick = () => onInput({ type: "LETTER", value: letter });
  }
}
  lastDraftMap.set(container, draft);

};
