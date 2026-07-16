// game-engine/keyboardState.js

const KEYBOARD_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["ENTER","Z","X","C","V","B","N","M","⌫"]
];

function getLetterStatusFromHistory(letter, state) {
  if (!state?.history) return { status: null, uncertain: false };

  // Extra constraints (forced greens / free yellows from powers)
  const extraGreens = state.extraConstraints
    ?.filter(c => c.type === "GREEN")
    .map(c => c.letter);

  if (extraGreens?.includes(letter)) {
    return { status: "green", uncertain: false };
  }

  const extraYellows = state.extraConstraints
    ?.filter(c => c.type === "YELLOW")
    .map(c => c.letter);

  // A floor, not a lock — a later guess revealing this letter as green
  // (a real position match) should still upgrade past it.
  let strongest = extraYellows?.includes(letter) ? "yellow" : null;
  let uncertain = false;

  for (const entry of state.history) {
    if (!entry?.guess) continue;

    const guess = entry.guess.toUpperCase();
    let fb = entry.fb; // safe state already provides the correct fb
    if (!fb){
      fb = entry.fbGuesser;
    }

    if (!Array.isArray(fb)) continue;

    for (let i = 0; i < 5; i++) {
      if (guess[i] !== letter) continue;

      const f = fb[i];
      if (!f || f === "?") continue;

      // Count Only masks feedback with "❓" — the letter's true status is
      // unknown, not confirmed absent, so it must not be scored as "gray".
      if (f === "❓") {
        uncertain = true;
        continue;
      }

      if (f === "🟩") strongest = "green";
      else if (f === "🟨" && strongest !== "green") strongest = "yellow";
      else if (f === "🟦" && !strongest) strongest = "blue";
      else if (f === "⬛" && !strongest) strongest = "gray";
    }
  }

  // A later, unmasked guess can resolve the letter's real status — once
  // that happens it's no longer "uncertain", just whatever it resolved to.
  return { status: strongest, uncertain: uncertain && !strongest };
}

function buildKeyboardState(state) {
  const keyboard = {};
  const uncertain = {};

  for (const row of KEYBOARD_LAYOUT) {
    for (const symbol of row) {
      if (!/^[A-Z]$/.test(symbol)) continue;

      const result = getLetterStatusFromHistory(symbol, state);
      keyboard[symbol] = result.status;
      if (result.uncertain) uncertain[symbol] = true;
    }
  }

  return { keyboard, uncertain };
}

module.exports = {
  buildKeyboardState
};
