// game-engine/keyboardState.js

const KEYBOARD_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["ENTER","Z","X","C","V","B","N","M","⌫"]
];

function getLetterStatusFromHistory(letter, state) {
  if (!state?.history) return null;

  // Extra constraints (forced greens)
  const extraGreens = state.extraConstraints
    ?.filter(c => c.type === "GREEN")
    .map(c => c.letter);

  if (extraGreens?.includes(letter)) {
    return "green";
  }

  let strongest = null;

  for (const entry of state.history) {
    if (!entry?.guess) continue;

    const guess = entry.guess.toUpperCase();
    let fb = entry.fb; // safe state already provides the correct fb
    if (!fb){
      fb = entr.fbGuesser;
    }
    
    if (!Array.isArray(fb)) continue;

    for (let i = 0; i < 5; i++) {
      if (guess[i] !== letter) continue;

      const f = fb[i];
      if (!f || f === "?") continue;

      if (f === "🟩") strongest = "green";
      else if (f === "🟨" && strongest !== "green") strongest = "yellow";
      else if (f === "🟦" && !strongest) strongest = "blue";
      else if (f === "⬛" && !strongest) strongest = "gray";
    }
  }

  return strongest;
}

function buildKeyboardState(state) {
  const keyboard = {};

  for (const row of KEYBOARD_LAYOUT) {
    for (const symbol of row) {
      if (!/^[A-Z]$/.test(symbol)) continue;

      keyboard[symbol] = getLetterStatusFromHistory(symbol, state);
    }
  }

  return keyboard;
}

module.exports = {
  buildKeyboardState
};
